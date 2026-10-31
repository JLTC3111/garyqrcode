"use client";

import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { ArrowDownToLine, ArrowRight, ArrowUpRight, BriefcaseBusiness, Check, ChevronDown, Clock3, FileCheck2, House, LoaderCircle, Moon, QrCode, ShieldCheck, Star, Sun, UserRound, X } from "lucide-react";
import { buildQuickSubmission, defaultIntake, feedbackTopicLabels, ratingLabels, receiptText, validateIntake, type FieldErrors, type IntakeData } from "@/lib/intake";
import { translate, type CopyValues, type Locale } from "@/lib/i18n";
import { PREFERENCES_KEY, resolvePreferences, type Theme } from "@/lib/preferences";
import QrShareCard from "@/components/qr-share-card";
import { CustomerServiceAppsMenu } from "./service-apps";

type Copy = (text: string, values?: CopyValues) => string;
const services = [
  { id: "home" as const, label: "Housing", icon: House },
  { id: "job" as const, label: "Jobs", icon: BriefcaseBusiness },
  { id: "paperwork" as const, label: "Paperwork", icon: FileCheck2 },
];
const network = [
  { name: "Gary Home", domain: "garyhome.vn", href: "https://garyhome.vn" },
  { name: "Gary Visa", domain: "visa.garyhome.vn", href: "https://visa.garyhome.vn" },
  { name: "Gary Agency", domain: "agency.garyhome.vn", href: "https://agency.garyhome.vn" },
];
function QuickField({ id, label, error, required, t, children }: { id: string; label: string; error?: string; required?: boolean; t: Copy; children: ReactNode }) {
  return <div className="quick-field"><label htmlFor={id}>{t(label)}{required ? <span className="quick-required" aria-hidden="true"> *</span> : <span className="quick-optional">{t("Optional")}</span>}</label>{children}{error && <p className="quick-error" id={`${id}-error`}>{t(error)}</p>}</div>;
}

export default function CustomerIntake({ previewQrSrc, previewOnly = false }: { previewQrSrc?: string; previewOnly?: boolean } = {}) {
  const [locale, setLocale] = useState<Locale>("en");
  const [theme, setTheme] = useState<Theme>("light");
  const t: Copy = (text, values) => translate(locale, text, values);
  const [data, setData] = useState<IntakeData>({ ...defaultIntake, services: [], feedbackTopics: [] });
  const [message, setMessage] = useState("");
  const [contact, setContact] = useState("");
  const [errors, setErrors] = useState<FieldErrors>({});
  const [submitting, setSubmitting] = useState(false);
  const [hoverRating, setHoverRating] = useState<number | null>(null);
  const [submissionError, setSubmissionError] = useState("");
  const [reference, setReference] = useState("");
  const [hydrated, setHydrated] = useState(false);
  const [privacyOpen, setPrivacyOpen] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const dialogTrigger = useRef<HTMLElement | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const statusRef = useRef<HTMLDivElement>(null);
  const submissionKey = useRef<string | null>(null);
  const attemptedPayload = useRef("");
  const sentData = useRef<IntakeData | null>(null);
  const includesRequest = data.intent !== "feedback";
  const includesFeedback = data.intent !== "help";
  const needsContact = includesRequest || data.followUp;
  const contactError = errors.email || errors.phone;
  const shownRating = hoverRating ?? data.overallRating;
  const hasErrors = Object.values(errors).some(Boolean);

  useEffect(() => {
    let saved: string | null = null;
    try { saved = localStorage.getItem(PREFERENCES_KEY); } catch { /* Preferences are optional. */ }
    const preferences = resolvePreferences(location.search, saved, navigator.language, matchMedia("(prefers-color-scheme: dark)").matches);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Hydrate browser-only preferences and link values after the server render.
    setLocale(preferences.locale); setTheme(preferences.theme);
    const params = new URLSearchParams(location.search);
    const prefill: Partial<IntakeData> = {};
    for (const [query, field, length] of [["rep", "repName", 150], ["company", "repCompany", 150], ["repEmail", "repEmail", 254], ["repPhone", "repPhone", 40], ["repCode", "repCode", 80]] as const) {
      const value = params.get(query); if (value) prefill[field] = value.slice(0, length);
    }
    const selected = params.getAll("service").flatMap((value) => value.split(",")).filter((value): value is IntakeData["services"][number] => ["home", "job", "paperwork"].includes(value));
    if (selected.length) prefill.services = [...new Set(selected)];
    setData((current) => ({ ...current, ...prefill }));
    setHydrated(true);
  }, []);
  useEffect(() => {
    if (!hydrated) return;
    document.documentElement.lang = locale;
    document.documentElement.dataset.theme = theme;
    document.title = translate(locale, "Gary · Quick feedback");
  }, [locale, theme, hydrated]);
  useEffect(() => {
    if (privacyOpen) { dialogTrigger.current = document.activeElement as HTMLElement; dialogRef.current?.showModal(); }
    else if (dialogRef.current?.open) { dialogRef.current.close(); dialogTrigger.current?.focus(); }
  }, [privacyOpen]);

  function preferences(nextLocale: Locale, nextTheme: Theme) {
    setLocale(nextLocale); setTheme(nextTheme);
    try { localStorage.setItem(PREFERENCES_KEY, JSON.stringify({ locale: nextLocale, theme: nextTheme })); } catch { /* The form works without storage. */ }
    try { const url = new URL(location.href); url.searchParams.set("lang", nextLocale); url.searchParams.set("theme", nextTheme); history.replaceState(history.state, "", url); } catch { /* Some offline browsers restrict history updates. */ }
  }
  function update<K extends keyof IntakeData>(key: K, value: IntakeData[K]) {
    setData((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: undefined }));
    setSubmissionError("");
  }
  function clearContactError() { setErrors((current) => ({ ...current, email: undefined, phone: undefined })); setSubmissionError(""); }
  function focusErrors(fieldErrors: FieldErrors) {
    const key = Object.keys(fieldErrors)[0];
    if (["repCompany", "repCode", "repEmail", "repPhone"].includes(key)) {
      const details = document.querySelector<HTMLDetailsElement>(".quick-rep-details");
      if (details) details.open = true;
    }
    const id = key === "email" || key === "phone" ? "contact" : key === "details" || key === "feedback" ? "message" : key;
    window.setTimeout(() => {
      const control = document.getElementById(id) || document.querySelector<HTMLInputElement>(`input[name="${key}"]`);
      control?.focus({ preventScroll: true }); control?.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth", block: "center" });
    }, 20);
  }
  async function send(event: FormEvent) {
    event.preventDefault(); if (submitting) return;
    // Pressing Send accepts the short notice directly above the button.
    const payload = buildQuickSubmission(data, message, contact);
    const fieldErrors = validateIntake(payload); setErrors(fieldErrors); setSubmissionError("");
    if (Object.keys(fieldErrors).length) { focusErrors(fieldErrors); return; }
    const serialized = JSON.stringify(payload);
    setSubmitting(true);
    try {
      if (previewOnly) throw new Error("This file is a preview. Open the running website to send your feedback.");
      if (attemptedPayload.current !== serialized) { submissionKey.current = crypto.randomUUID(); attemptedPayload.current = serialized; }
      submissionKey.current ||= crypto.randomUUID();
      const response = await fetch("/api/submissions", { method: "POST", headers: { "Content-Type": "application/json", "Idempotency-Key": submissionKey.current }, body: serialized, signal: AbortSignal.timeout(25000) });
      let raw: unknown = null;
      try { raw = await response.json(); } catch { /* An unavailable server may return HTML or an empty response. */ }
      const result = raw && typeof raw === "object" ? raw as { error?: unknown; reference?: unknown; fields?: unknown } : {};
      if (!response.ok && result.fields && typeof result.fields === "object") {
        const serverErrors: FieldErrors = {};
        for (const key of Object.keys(defaultIntake) as (keyof IntakeData)[]) {
          const messages = (result.fields as Record<string, unknown>)[key];
          if (Array.isArray(messages) && typeof messages[0] === "string") serverErrors[key] = messages[0];
        }
        setErrors(serverErrors);
      }
      if (!response.ok) throw new Error(typeof result.error === "string" ? result.error : "Your form hasn’t been saved. Please try again.");
      if (typeof result.reference !== "string") throw new Error("We couldn’t confirm your submission. Please try again.");
      sentData.current = payload; setReference(result.reference);
      try { localStorage.removeItem("gary-customer-draft-v1"); } catch { /* Old drafts are optional. */ }
      window.setTimeout(() => { headingRef.current?.focus({ preventScroll: true }); headingRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }); }, 20);
    } catch (problem) {
      setSubmissionError(problem instanceof Error && !["TypeError", "TimeoutError", "ReferenceError", "SyntaxError"].includes(problem.name) ? problem.message : "We couldn’t confirm your submission. Your answers are still here. Try sending again; the same request won’t be saved twice.");
      window.setTimeout(() => { statusRef.current?.focus({ preventScroll: true }); statusRef.current?.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth", block: "center" }); }, 20);
    } finally { setSubmitting(false); }
  }
  function download() {
    if (!sentData.current) return;
    const url = URL.createObjectURL(new Blob([receiptText(sentData.current, reference, locale)], { type: "text/plain;charset=utf-8" }));
    const link = document.createElement("a"); link.href = url; link.download = `${reference}.txt`; link.click(); window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  function reset() { setData({ ...defaultIntake, services: [], feedbackTopics: [] }); setHoverRating(null); setMessage(""); setContact(""); setErrors({}); setReference(""); setSubmissionError(""); submissionKey.current = null; attemptedPayload.current = ""; sentData.current = null; }
  const initials = data.repName.trim().split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toLocaleUpperCase(locale);
  const repInput = (key: "repCompany" | "repCode" | "repEmail" | "repPhone") => ({ id: key, value: data[key], "aria-invalid": !!errors[key], "aria-describedby": errors[key] ? `${key}-error` : undefined, onChange: (event: React.ChangeEvent<HTMLInputElement>) => update(key, event.target.value) });

  return <div className="site-shell quick-page">
    <a className="skip-link" href="#customer-form">{t("Skip to the form")}</a>
    <header className="site-header quick-header">
      {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- A full navigation intentionally starts a fresh form. */}
      <a className="brand" href="/" aria-label={t("Gary Customer Connect home")}><span className="brand-mark"><span/><span/><span/><span/></span><span className="brand-name">gary<span className="brand-period">.</span></span><span className="brand-divider"/><span className="brand-caption">{t("Feedback & support")}</span></a>
      <div className="header-controls"><CustomerServiceAppsMenu language={locale} className="gary-apps-menu--customer"/><div className="language-switch" role="group" aria-label={t("Language")}><button type="button" lang="en" aria-label="Switch to English" aria-pressed={locale === "en"} onClick={() => preferences("en", theme)}>EN</button><button type="button" lang="vi" aria-label="Chuyển sang Tiếng Việt" aria-pressed={locale === "vi"} onClick={() => preferences("vi", theme)}>VI</button></div><button type="button" className="theme-toggle" aria-label={t(theme === "dark" ? "Switch to light mode" : "Switch to dark mode")} onClick={() => preferences(locale, theme === "dark" ? "light" : "dark")}>{theme === "dark" ? <Sun size={17}/> : <Moon size={17}/>}</button></div>
    </header>
    <main className="quick-main">
      <div className="quick-intro"><h1>{t(data.intent === "help" ? "How can we help?" : data.intent === "both" ? "Feedback & support" : "How did we do?")}</h1><span className="quick-time"><Clock3 size={14}/>{t("1–2 minutes")}</span></div>
      {reference ? <section className="quick-success" id="customer-form"><span className="quick-success-icon"><Check size={27}/></span><h2 ref={headingRef} tabIndex={-1}>{t(data.intent === "help" ? "Your request is in." : "Thanks for your feedback.")}</h2><p>{t("Your details have been saved. Keep this reference if you need to follow up.")}</p><code>{reference}</code><button type="button" className="quick-secondary" onClick={download}><ArrowDownToLine size={15}/>{t("Download your summary")}</button><button type="button" className="quick-send" onClick={reset}>{t("Send another submission")}<ArrowRight size={17}/></button></section> : <>
        <div className="quick-purpose" role="radiogroup" aria-label={t("Submission purpose")}>{([["feedback", "Leave feedback"], ["help", "Request help"], ["both", "Both"]] as const).map(([value, label]) => <label key={value} className={data.intent === value ? "active" : ""}><input type="radio" name="intent" value={value} checked={data.intent === value} onChange={() => { update("intent", value); setErrors({}); }}/><span>{t(label)}</span></label>)}</div>
        {previewOnly && <p className="quick-preview-note">{t("Preview only — feedback isn’t saved from this file.")} <a href="http://127.0.0.1:3000/">{t("Open running site")}</a></p>}
        <form className="quick-form" id="customer-form" noValidate onSubmit={send} aria-label={t("Customer information form")} aria-busy={submitting}>
          <div className="quick-context">
            <section className="quick-representative"><QuickField id="repName" label="Who helped you?" required error={errors.repName} t={t}><div className={`quick-rep-input${errors.repName ? " invalid" : ""}`}><span className="quick-avatar" aria-hidden="true">{initials || <UserRound size={21}/>}</span><input id="repName" name="repName" autoComplete="off" value={data.repName} onChange={(event) => update("repName", event.target.value)} placeholder={t("Representative’s name")} maxLength={150} required aria-invalid={!!errors.repName} aria-describedby={errors.repName ? "repName-error" : undefined}/></div></QuickField>{data.repCompany && <p className="quick-rep-company">{data.repCompany}</p>}</section>
            <fieldset className="quick-services" id="services" tabIndex={-1} aria-describedby={errors.services ? "services-error" : undefined}><legend>{t("Which service?")}<span className="quick-required" aria-hidden="true"> *</span></legend><div className="quick-service-options">{services.map(({ id, label, icon: Icon }) => <label key={id} className={data.services.includes(id) ? "selected" : ""}><input type="checkbox" name="services" value={id} checked={data.services.includes(id)} onChange={() => update("services", data.services.includes(id) ? data.services.filter((service) => service !== id) : [...data.services, id])}/><Icon size={19}/><span>{t(label)}</span>{data.services.includes(id) && <Check size={11} className="quick-choice-check"/>}</label>)}</div>{errors.services && <p className="quick-error" id="services-error">{t(errors.services)}</p>}</fieldset>
          </div>
          <details className="quick-rep-details"><summary>{t("Add company or rep contact details")}<span>{t("Optional")}</span><ChevronDown size={13}/></summary><div className="quick-extra-grid"><QuickField id="repCompany" label="Company or agency" error={errors.repCompany} t={t}><input {...repInput("repCompany")} maxLength={150}/></QuickField><QuickField id="repCode" label="Representative ID or code" error={errors.repCode} t={t}><input {...repInput("repCode")} maxLength={80}/></QuickField><QuickField id="repEmail" label="Representative’s email" error={errors.repEmail} t={t}><input {...repInput("repEmail")} type="email" maxLength={254}/></QuickField><QuickField id="repPhone" label="Representative’s phone" error={errors.repPhone} t={t}><input {...repInput("repPhone")} type="tel" maxLength={40}/></QuickField></div></details>
          {includesFeedback && <>
            <fieldset className="quick-rating" aria-describedby={errors.overallRating ? "overallRating-error" : "rating-hint"}><legend>{t("How was your experience?")}<span className="quick-required" aria-hidden="true"> *</span></legend><p id="rating-hint">{t("Just tap a star.")}</p><div className="quick-stars" onPointerLeave={() => setHoverRating(null)} onKeyDown={() => setHoverRating(null)}>{[1,2,3,4,5].map((rating) => <label key={rating} className={rating <= shownRating ? "selected" : ""} onPointerEnter={(event) => { if (event.pointerType === "mouse" || event.pointerType === "pen") setHoverRating(rating); }}><input type="radio" name="overallRating" checked={data.overallRating === rating} onChange={() => update("overallRating", rating)} value={rating} aria-label={t(rating === 1 ? "{count} star — {rating}" : "{count} stars — {rating}", { count: rating, rating: t(ratingLabels[rating]) })}/><Star size={36} strokeWidth={1.5}/></label>)}</div><p className="quick-rating-label" aria-live="polite">{shownRating ? t(ratingLabels[shownRating]) : t("Choose 1 to 5 stars")}</p>{errors.overallRating && <p className="quick-error" id="overallRating-error">{t(errors.overallRating)}</p>}</fieldset>
            <fieldset className="quick-topics"><legend>{t(data.overallRating > 0 && data.overallRating <= 3 ? "What could be better?" : "What stood out?")}<span className="quick-optional">{t("Optional")}</span></legend><div className="quick-topic-options">{(Object.entries(feedbackTopicLabels) as [keyof typeof feedbackTopicLabels, string][]).map(([value, label]) => <label key={value} className={data.feedbackTopics.includes(value) ? "selected" : ""}><input type="checkbox" name="feedbackTopics" value={value} checked={data.feedbackTopics.includes(value)} onChange={() => update("feedbackTopics", data.feedbackTopics.includes(value) ? data.feedbackTopics.filter((topic) => topic !== value) : [...data.feedbackTopics, value])}/>{data.feedbackTopics.includes(value) && <Check size={13}/>}<span>{t(label)}</span></label>)}</div></fieldset>
          </>}
          <div className="quick-message"><QuickField id="message" label={includesRequest ? "How can we help?" : "Anything else?"} required={includesRequest} error={errors.details || errors.feedback} t={t}><textarea id="message" name="message" value={message} onChange={(event) => { setMessage(event.target.value); setErrors((current) => ({ ...current, details: undefined, feedback: undefined })); setSubmissionError(""); }} rows={3} maxLength={3000} placeholder={t(includesRequest ? "A sentence or two about what you need." : "A quick note is enough.")} aria-invalid={!!(errors.details || errors.feedback)} aria-describedby={errors.details || errors.feedback ? "message-error" : undefined} required={includesRequest}/></QuickField></div>
          {!includesRequest && <label className="quick-follow-up"><input type="checkbox" checked={data.followUp} onChange={(event) => { update("followUp", event.target.checked); clearContactError(); }}/><span>{t("I’d like someone to follow up with me.")}</span></label>}
          {needsContact && <div className="quick-contact"><QuickField id="contact" label="Your email or phone" required error={contactError} t={t}><input id="contact" type="text" inputMode="email" autoComplete="email" value={contact} onChange={(event) => { setContact(event.target.value); clearContactError(); }} placeholder={t("Email address or phone number")} maxLength={254} required aria-invalid={!!contactError} aria-describedby={contactError ? "contact-error" : undefined}/></QuickField><QuickField id="firstName" label="Your name" error={errors.firstName} t={t}><input id="firstName" value={data.firstName} onChange={(event) => update("firstName", event.target.value)} autoComplete="name" maxLength={80}/></QuickField></div>}
          <div className="honey-field" aria-hidden="true"><label htmlFor="website">{t("Website")}</label><input id="website" name="website" value={data.website} onChange={(event) => update("website", event.target.value)} tabIndex={-1} autoComplete="off"/></div>
          {(submissionError || hasErrors) && <div ref={statusRef} className="submission-error quick-submit-error" role="alert" tabIndex={-1}>{t(submissionError || "Please check the highlighted fields.")}</div>}
          <div className="quick-finish"><p>{t("By sending, you agree that Gary may use these details to handle this submission.")} <button type="button" onClick={() => setPrivacyOpen(true)}>{t("About your information")}</button></p><button type="submit" className="quick-send" disabled={submitting || !hydrated}>{submitting ? <><LoaderCircle size={18} className="spin"/>{t("Sending…")}</> : <>{t(data.intent === "help" ? "Send request" : data.intent === "both" ? "Send feedback & request" : "Send feedback")}<ArrowRight size={18}/></>}</button><span className="quick-private-note"><ShieldCheck size={12}/>{t("Shared privately with the Gary team.")}</span></div>
        </form>
      </>}
      <details className="quick-share"><summary><QrCode size={15}/>{t("Share this page")}<ChevronDown size={13}/></summary><QrShareCard locale={locale} previewSrc={previewQrSrc}/></details>
    </main>
    <footer className="quick-footer"><nav aria-label={t("Explore Gary")}>{network.map(({name,domain,href}) => <a key={href} href={href} target="_blank" rel="noopener noreferrer" aria-label={`${name} — ${domain} (${t("opens in a new tab")})`}>{name}<ArrowUpRight size={12}/></a>)}</nav><div><span>© {new Date().getFullYear()} Gary</span><button type="button" onClick={() => setPrivacyOpen(true)}>{t("Your information")}</button><a href="/staff">{t("Staff access")}</a></div></footer>
    <dialog ref={dialogRef} className="info-dialog" aria-labelledby="privacy-title" onCancel={() => setPrivacyOpen(false)} onClick={(event) => { if (event.target === event.currentTarget) setPrivacyOpen(false); }}><div className="dialog-inner"><button className="dialog-close icon-button" type="button" onClick={() => setPrivacyOpen(false)} aria-label={t("Close dialog")}><X size={20}/></button><h2 id="privacy-title">{t("About your information")}</h2><div className="dialog-copy"><p>{t("We store your service choice, representative details, rating, and any comments you send so the Gary team can review them.")}</p><p>{t("Your name and contact details are optional for feedback. Add a contact only if you want a reply or are requesting help.")}</p><p>{t("Please avoid entering identity document numbers, passwords, banking details, or other sensitive information. No documents or attachments are needed here.")}</p></div><button className="primary-button" type="button" onClick={() => setPrivacyOpen(false)}>{t("Got it")}<Check size={16}/></button></div></dialog>
  </div>;
}
