import { z } from "zod/v3";
import { translate, type Locale } from "./i18n";

const optionalText = (max = 200) => z.string().trim().max(max);
const optionalEmail = z.union([z.literal(""), z.string().trim().email("Enter a valid email address.").max(254)]);
export const serviceLabels = { home: "Find a home", job: "Find a job", paperwork: "Get paperwork help" } as const;
export type Service = keyof typeof serviceLabels;
export const intentLabels = { help: "Request assistance", feedback: "Share feedback", both: "Assistance & feedback" } as const;
export const ratingLabels = ["", "Poor", "Fair", "Good", "Very good", "Excellent"];
export const feedbackTopicLabels = { communication: "Clear communication", speed: "Response time", knowledge: "Staff expertise", support: "Friendly support" } as const;

const baseSchema = z.object({
  intent: z.enum(["help", "feedback", "both"]),
  services: z.array(z.enum(["home", "job", "paperwork"])).min(1, "Choose at least one area.").max(3).refine((items) => new Set(items).size === items.length),
  repName: z.string().trim().min(2, "Enter your representative’s name.").max(150),
  repCompany: optionalText(150),
  repEmail: optionalEmail,
  repPhone: optionalText(40),
  repCode: optionalText(80),
  connection: z.enum(["", "Referral", "Online", "In person", "Returning customer", "Other"]),
  overallRating: z.number().int().min(0).max(5),
  communicationRating: z.number().int().min(0).max(5),
  helpfulnessRating: z.number().int().min(0).max(5),
  feedback: optionalText(3000),
  feedbackTopics: z.array(z.enum(["communication", "speed", "knowledge", "support"])).max(4).refine((items) => new Set(items).size === items.length).default([]),
  followUp: z.boolean().default(false),
  firstName: optionalText(80),
  lastName: optionalText(80),
  email: optionalEmail,
  phone: optionalText(40),
  contactPreference: z.enum(["email", "phone", "text"]),
  location: optionalText(200),
  timeline: z.enum(["", "As soon as possible", "Within a month", "1–3 months", "Just exploring"]),
  homeGoal: z.enum(["", "Rent a home", "Buy a home", "Explore my options"]),
  homeBudget: optionalText(120),
  jobRole: optionalText(200),
  jobType: z.enum(["", "Full-time", "Part-time", "Contract", "Open to anything"]),
  paperworkType: z.enum(["", "Housing or rental documents", "Employment documents", "Applications or forms", "General document support", "Something else", "I’m not sure yet"]),
  details: optionalText(3000),
  consent: z.boolean(),
  website: z.string().max(200),
});

export type IntakeData = z.infer<typeof baseSchema>;
export const defaultIntake: IntakeData = {
  intent: "feedback", services: [], repName: "", repCompany: "", repEmail: "", repPhone: "", repCode: "", connection: "",
  overallRating: 0, communicationRating: 0, helpfulnessRating: 0, feedback: "", firstName: "", lastName: "", email: "", phone: "",
  contactPreference: "email", location: "", timeline: "", homeGoal: "", homeBudget: "", jobRole: "", jobType: "", paperworkType: "", details: "", consent: false, website: "", feedbackTopics: [], followUp: false,
};

export const intakeSchema = baseSchema.superRefine((data, ctx) => {
  const issue = (path: keyof IntakeData, message: string) => ctx.addIssue({ code: z.ZodIssueCode.custom, path: [path], message });
  if (data.intent !== "help" && data.overallRating === 0) issue("overallRating", "Choose an overall rating for your representative.");
  if (data.intent !== "feedback" && !data.details) issue("details", "Tell us a little about the help you need.");
  const needsContact = data.intent !== "feedback" || data.followUp;
  if (needsContact && data.contactPreference === "email" && !data.email) issue("email", "Enter an email address so we can follow up.");
  if (needsContact && data.contactPreference !== "email" && data.phone.replace(/\D/g, "").length < 7) issue("phone", "Enter a phone number with at least 7 digits.");
  if (data.phone && (data.phone.replace(/\D/g, "").length < 7 || !/^[+\d\s().-]+$/.test(data.phone))) issue("phone", "Enter a valid phone number.");
  if (data.repPhone && (data.repPhone.replace(/\D/g, "").length < 7 || !/^[+\d\s().-]+$/.test(data.repPhone))) issue("repPhone", "Enter a valid phone number.");
  if (!data.consent) issue("consent", "Please agree to the use of your details before sending.");
});

export const draftSchema = baseSchema.extend({
  services: z.array(z.enum(["home", "job", "paperwork"])).max(3),
  repName: optionalText(150), firstName: optionalText(80), lastName: optionalText(80),
  email: optionalText(254), repEmail: optionalText(254),
}).partial();
export type FieldErrors = Partial<Record<keyof IntakeData, string>>;
export function validateIntake(data: IntakeData): FieldErrors {
  const result = intakeSchema.safeParse(data);
  if (result.success) return {};
  const errors: FieldErrors = {};
  for (const issue of result.error.issues) {
    const key = issue.path[0] as keyof IntakeData;
    if (!errors[key]) errors[key] = issue.message;
  }
  return errors;
}

export function cleanSubmission(data: IntakeData): IntakeData {
  return {
    ...data,
    ...(data.intent === "help" ? { overallRating: 0, communicationRating: 0, helpfulnessRating: 0, feedback: "", feedbackTopics: [] } : {}),
    ...(data.intent === "feedback" ? { timeline: "" as const, homeGoal: "" as const, homeBudget: "", jobRole: "", jobType: "" as const, paperworkType: "" as const, details: "" } : {}),
    ...(!data.services.includes("home") ? { homeGoal: "" as const, homeBudget: "" } : {}),
    ...(!data.services.includes("job") ? { jobRole: "", jobType: "" as const } : {}),
    ...(!data.services.includes("paperwork") ? { paperworkType: "" as const } : {}),
    website: "",
  };
}

export function buildQuickSubmission(data: IntakeData, message: string, contact: string): IntakeData {
  const needsContact = data.intent !== "feedback" || data.followUp;
  const value = needsContact ? contact.trim() : "";
  return { ...cleanSubmission({
    ...data,
    feedback: data.intent === "help" ? "" : message,
    details: data.intent === "feedback" ? "" : message,
    firstName: needsContact ? data.firstName : "",
    lastName: needsContact ? data.lastName : "",
    email: value.includes("@") ? value : "",
    phone: value.includes("@") ? "" : value,
    contactPreference: value && !value.includes("@") ? "phone" : "email",
    consent: true,
  }), website: data.website };
}

export function receiptText(data: IntakeData, reference: string, locale: Locale = "en") {
  const t = (text: string) => translate(locale, text);
  const line = (label: string, value: string) => `${t(label)}: ${value || t("Not provided")}`;
  const name = (locale === "vi" ? `${data.lastName} ${data.firstName}` : `${data.firstName} ${data.lastName}`).trim();
  const lines = [t("GARY · CUSTOMER CONNECT"), line("Reference", reference), "", line("Purpose", t(intentLabels[data.intent])), line("Services", data.services.map((s) => t(serviceLabels[s])).join(", ")), "", t("REPRESENTATIVE"), line("Name", data.repName), line("Company", data.repCompany), line("Email", data.repEmail), line("Phone", data.repPhone), line("Rep code", data.repCode), line("Connection", t(data.connection)), "", t("YOUR CONTACT DETAILS"), line("Name", name), line("Email", data.email), line("Phone", data.phone), line("Preferred contact", t(data.contactPreference === "text" ? "Text message" : data.contactPreference === "phone" ? "Phone call" : "Email")), line("Location", data.location)];
  if (data.intent !== "feedback") lines.push("", t("YOUR REQUEST"), line("Timeline", t(data.timeline)), ...Object.entries({ "Housing goal": t(data.homeGoal), "Housing budget": data.homeBudget, "Job or industry": data.jobRole, "Work type": t(data.jobType), "Document support": t(data.paperworkType) }).filter(([, value]) => value).map(([key, value]) => line(key, value)), data.details);
  if (data.intent !== "help") lines.push("", t("YOUR FEEDBACK"), line("Overall", `${data.overallRating}/5`), ...(data.feedbackTopics.length ? [line(data.overallRating <= 3 ? "Could be improved" : "Feedback highlights", data.feedbackTopics.map((topic) => t(feedbackTopicLabels[topic])).join(", "))] : []), ...(data.communicationRating ? [line("Communication", `${data.communicationRating}/5`)] : []), ...(data.helpfulnessRating ? [line("Helpfulness", `${data.helpfulnessRating}/5`)] : []), data.intent === "both" && data.feedback === data.details ? "" : data.feedback || t("No written feedback provided."));
  return lines.join("\n");
}
