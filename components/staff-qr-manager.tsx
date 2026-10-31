"use client";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { createClient, type Session, type SupabaseClient } from "@supabase/supabase-js";
import { ArrowDownToLine, ArrowLeft, ArrowRight, Check, ImagePlus, LoaderCircle, LogOut, Moon, QrCode, RefreshCw, ShieldCheck, Sun, Upload } from "lucide-react";
import { translate, type Locale } from "@/lib/i18n";
import { PREFERENCES_KEY, resolvePreferences, type Theme } from "@/lib/preferences";
import { DEFAULT_QR_DESTINATION, normalizeQrDestination, qrSvg, validateQrPng, type PublicQr } from "@/lib/qr";

type Candidate = { mode: "generate" | "upload"; destination: string; imageUrl: string; file?: File };
type Staff = { userId: string; email: string; role: string };
export default function StaffQrManager({ previewImage }: { previewImage?: string }) {
  const [locale, setLocale] = useState<Locale>("en"); const [theme, setTheme] = useState<Theme>("light");
  const t = (text: string) => translate(locale, text);
  const [loading, setLoading] = useState(!previewImage); const [busy, setBusy] = useState(false); const [error, setError] = useState(""); const [notice, setNotice] = useState("");
  const [email, setEmail] = useState(""); const [password, setPassword] = useState(""); const [code, setCode] = useState(""); const [factorId, setFactorId] = useState("");
  const [session, setSession] = useState<Session | null>(null); const [staff, setStaff] = useState<Staff | null>(null);
  const [current, setCurrent] = useState<PublicQr | null>(null); const [destination, setDestination] = useState(DEFAULT_QR_DESTINATION); const [mode, setMode] = useState<"generate" | "upload">("generate");
  const [file, setFile] = useState<File | null>(null); const [candidate, setCandidate] = useState<Candidate | null>(null);
  const client = useRef<SupabaseClient | null>(null); const requestId = useRef(0);
  const activeToken = useRef<string | null>(null);
  const accessToken = session?.access_token;
  const updateSession = useCallback((value: Session | null) => {
    const nextToken = value?.access_token ?? null;
    if (nextToken !== activeToken.current) {
      activeToken.current = nextToken;
      if (nextToken) setLoading(true);
    }
    if (!value) {
      requestId.current++; setStaff(null); setCurrent(null); setCandidate(null); setLoading(false);
    }
    setSession(value);
  }, []);

  useEffect(() => {
    let saved: string | null = null; try { saved = localStorage.getItem(PREFERENCES_KEY); } catch { /* Optional browser preferences. */ }
    const preferences = resolvePreferences(location.search, saved, navigator.language, matchMedia("(prefers-color-scheme: dark)").matches);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Hydrate browser-only preferences after the server render.
    setLocale(preferences.locale); setTheme(preferences.theme);
    if (previewImage) return;
    let active = true; let unsubscribe: (() => void) | undefined;
    fetch("/api/staff/config", { signal: AbortSignal.timeout(12000) }).then(async (response) => {
      const config = await response.json() as { url?: string; key?: string; error?: string };
      if (!response.ok || !config.url || !config.key) throw new Error(config.error || "Staff sign-in is not configured yet.");
      if (!active) return;
      const auth = createClient(config.url, config.key, { auth: { storageKey: "gary-customer-connect-staff", persistSession: true, autoRefreshToken: true, detectSessionInUrl: false }, global: { fetch: (input, init) => fetch(input, { ...init, signal: init?.signal ? AbortSignal.any([init.signal, AbortSignal.timeout(15000)]) : AbortSignal.timeout(15000) }) } });
      client.current = auth;
      const { data: { subscription } } = auth.auth.onAuthStateChange((_event, value) => { if (active) updateSession(value); });
      unsubscribe = () => subscription.unsubscribe();
      const { data, error } = await auth.auth.getSession();
      if (error) throw new Error("Your session has expired. Please sign in again.");
      if (active) updateSession(data.session);
    }).catch((problem) => { if (active) { setError(problem instanceof Error && problem.name !== "TypeError" ? problem.message : "Staff sign-in is not available right now. Please try again."); setLoading(false); } });
    return () => { active = false; unsubscribe?.(); client.current?.auth.stopAutoRefresh(); };
  }, [previewImage, updateSession]);
  useEffect(() => { document.documentElement.lang = locale; document.documentElement.dataset.theme = theme; document.title = `${translate(locale, "QR code manager")} · Gary`; }, [locale, theme]);
  useEffect(() => { return () => { if (candidate?.imageUrl.startsWith("blob:")) URL.revokeObjectURL(candidate.imageUrl); }; }, [candidate]);
  useEffect(() => {
    if (!accessToken) return;
    const id = ++requestId.current; const controller = new AbortController();
    fetch("/api/staff/qr", { headers: { Authorization: `Bearer ${accessToken}` }, signal: controller.signal }).then(async (response) => {
      const result = await response.json() as { staff?: Staff; qr?: PublicQr; error?: string; code?: string };
      if (controller.signal.aborted || id !== requestId.current) return;
      if (!response.ok) {
        if (result.code === "mfa_required") {
          const factors = await client.current?.auth.mfa.listFactors();
          if (controller.signal.aborted || id !== requestId.current) return;
          const factor = factors?.data?.totp.find((item) => item.status === "verified");
          if (!factor) throw new Error("Complete your account verification in the Gary staff portal.");
          setFactorId(factor.id); setStaff(null); setError(""); return;
        }
        throw new Error(result.error || "Active Gary staff access is required.");
      }
      if (id !== requestId.current || !result.staff || !result.qr) return;
      setStaff(result.staff); setCurrent(result.qr); setDestination(result.qr.destination); setError(""); setFactorId("");
    }).catch((problem) => { if (!controller.signal.aborted) { setStaff(null); setError(problem instanceof Error ? problem.message : "We couldn’t verify your staff permissions. Please try again."); } }).finally(() => { if (!controller.signal.aborted && id === requestId.current) setLoading(false); });
    return () => controller.abort();
  }, [accessToken]);

  function preferences(nextLocale: Locale, nextTheme: Theme) {
    setLocale(nextLocale); setTheme(nextTheme);
    try { localStorage.setItem(PREFERENCES_KEY, JSON.stringify({locale:nextLocale,theme:nextTheme})); } catch { /* Switching works without storage. */ }
    try { const url = new URL(location.href); url.searchParams.set("lang", nextLocale); url.searchParams.set("theme", nextTheme); history.replaceState(history.state,"",url); } catch { /* Offline preview browsers can restrict history changes. */ }
  }
  async function signIn(event: FormEvent) {
    event.preventDefault(); if (busy) return; setBusy(true); setError("");
    try {
      if (!client.current) throw new Error("Staff sign-in is not available right now. Please try again.");
      const result = await client.current.auth.signInWithPassword({email:email.trim(),password});
      setPassword("");
      if (result.error) throw new Error(result.error.status && result.error.status < 500 ? "Check your email and password, then try again." : "Staff sign-in is not available right now. Please try again.");
      updateSession(result.data.session);
    } catch (problem) { setError(problem instanceof Error ? problem.message : "Staff sign-in is not available right now. Please try again."); }
    finally { setBusy(false); }
  }
  async function verifyCode(event: FormEvent) {
    event.preventDefault(); if (!client.current || busy) return; setBusy(true); setError("");
    try { const result = await client.current.auth.mfa.challengeAndVerify({factorId,code:code.trim()}); if (result.error) throw new Error("Check your verification code and try again."); const fresh = await client.current.auth.getSession(); updateSession(fresh.data.session); setCode(""); setFactorId(""); }
    catch (problem) { setError(problem instanceof Error ? problem.message : "Check your verification code and try again."); }
    finally { setBusy(false); }
  }
  async function signOut() {
    setBusy(true); setError("");
    try { const result = await client.current?.auth.signOut({scope:"local"}); if (result?.error) throw new Error("We couldn’t sign you out. Please try again."); updateSession(null); setFactorId(""); setNotice(""); }
    catch (problem) { setError((problem as Error).message); }
    finally { setBusy(false); }
  }
  async function preview() {
    setError(""); setNotice("");
    try {
      const normalized = normalizeQrDestination(destination);
      if (mode === "upload") {
        if (!file) throw new Error("Choose a PNG QR image first.");
        validateQrPng(new Uint8Array(await file.arrayBuffer()));
        setCandidate({mode,destination:normalized,imageUrl:URL.createObjectURL(file),file});
      } else setCandidate({mode,destination:normalized,imageUrl:`data:image/svg+xml;charset=utf-8,${encodeURIComponent(qrSvg(normalized))}`});
    } catch (problem) { setCandidate(null); setError((problem as Error).message); }
  }
  async function reloadCurrent() {
    if (!client.current) return; setLoading(true); setError("");
    try { const fresh=await client.current.auth.getSession(); if(!fresh.data.session)throw new Error("Your session has expired. Please sign in again."); const response=await fetch("/api/staff/qr",{headers:{Authorization:`Bearer ${fresh.data.session.access_token}`},signal:AbortSignal.timeout(15000)});const result=await response.json() as {qr?:PublicQr;staff?:Staff;error?:string};if(!response.ok||!result.qr||!result.staff)throw new Error(result.error||"We couldn’t load the current QR code.");setCurrent(result.qr);setStaff(result.staff); }
    catch(problem){setError((problem as Error).message);}
    finally{setLoading(false);}
  }
  async function save() {
    if (!candidate || !current || busy || !client.current) return; setBusy(true); setError(""); setNotice("");
    try {
      const fresh = await client.current.auth.getSession(); if (!fresh.data.session) throw new Error("Your session has expired. Please sign in again.");
      const headers: Record<string,string> = {Authorization:`Bearer ${fresh.data.session.access_token}`}; let body: BodyInit;
      if (candidate.mode === "upload" && candidate.file) { const form=new FormData();form.set("image",candidate.file);form.set("destination",candidate.destination);form.set("expectedVersion",current.version);body=form; }
      else { headers["Content-Type"]="application/json";body=JSON.stringify({mode:"generate",destination:candidate.destination,expectedVersion:current.version}); }
      const response=await fetch("/api/staff/qr",{method:"POST",headers,body,signal:AbortSignal.timeout(25000)});const result=await response.json() as {qr?:PublicQr;error?:string};
      if(!response.ok||!result.qr)throw new Error(result.error||"The QR code could not be saved. Please try again.");
      setCurrent(result.qr);setCandidate(null);setFile(null);setNotice("The customer QR code has been updated.");
    } catch(problem){setError(problem instanceof Error && !["TypeError","TimeoutError"].includes(problem.name)?problem.message:"We couldn’t confirm the update. Reload the current QR code before trying again.");}
    finally{setBusy(false);}
  }

  return <div className="site-shell staff-shell"><header className="site-header"><Link className="brand" href="/" aria-label={t("Gary Customer Connect home")}><span className="brand-mark"><span/><span/><span/><span/></span><span className="brand-name">gary<span className="brand-period">.</span></span><span className="brand-divider"/><span className="brand-caption">{t("Staff access")}</span></Link><div className="header-controls"><div className="language-switch" role="group" aria-label={t("Language")}><button type="button" lang="en" aria-label="Switch to English" aria-pressed={locale==="en"} onClick={()=>preferences("en",theme)}>EN</button><button type="button" lang="vi" aria-label="Chuyển sang Tiếng Việt" aria-pressed={locale==="vi"} onClick={()=>preferences("vi",theme)}>VI</button></div><button type="button" className="theme-toggle" aria-label={t(theme==="dark"?"Switch to light mode":"Switch to dark mode")} onClick={()=>preferences(locale,theme==="dark"?"light":"dark")}>{theme==="dark"?<Sun size={17}/>:<Moon size={17}/>}</button></div></header>
    <main className="staff-main"><Link className="staff-back" href="/"><ArrowLeft size={14}/>{t("Back to the customer page")}</Link><div className="staff-heading"><p className="eyebrow"><ShieldCheck size={14}/>{t("GARY STAFF")}</p><h1>{t("A clear connection.")}</h1><p>{t("Manage the QR code customers use to reach this page.")}</p></div>
      {!staff ? <section className="form-card staff-login"><span className="dialog-icon"><QrCode size={25}/></span><h2>{t(factorId?"Verify your account":"Staff sign in")}</h2><p className="section-description">{t(factorId?"Enter the code from your authenticator app.":"Use your existing Gary staff email and password.")}</p>{loading?<p className="staff-loading"><LoaderCircle className="spin" size={17}/>{t("Checking your session…")}</p>:factorId?<form onSubmit={verifyCode}><div className="field"><label htmlFor="staff-code">{t("Verification code")}</label><input id="staff-code" inputMode="numeric" autoComplete="one-time-code" value={code} onChange={e=>setCode(e.target.value.replace(/\D/g,"").slice(0,6))} minLength={6} maxLength={6} required/></div><button className="primary-button" type="submit" disabled={busy}>{t(busy?"Verifying…":"Verify account")}<ArrowRight size={16}/></button></form>:<form onSubmit={signIn}><div className="field"><label htmlFor="staff-email">{t("Staff email")}</label><input id="staff-email" type="email" autoComplete="username" value={email} onChange={e=>setEmail(e.target.value)} placeholder="name@company.com" required/></div><div className="field"><label htmlFor="staff-password">{t("Password")}</label><input id="staff-password" type="password" autoComplete="current-password" value={password} onChange={e=>setPassword(e.target.value)} required/></div><button className="primary-button" type="submit" disabled={busy}>{busy?<LoaderCircle className="spin" size={16}/>:null}{t(busy?"Signing in…":"Sign in")}<ArrowRight size={16}/></button><a className="staff-portal-link" href="https://garyhome.vn/admin" target="_blank" rel="noopener noreferrer">{t("Account help in the Gary staff portal")}<ArrowRight size={12}/></a></form>}{session&&!staff&&!loading&&<button className="staff-portal-link" type="button" onClick={signOut}>{t("Use a different account")}</button>}</section>:<div className="staff-workspace"><section className="form-card staff-current"><div className="staff-card-heading"><h2>{t("Current QR code")}</h2><button type="button" className="icon-button" aria-label={t("Reload current QR code")} onClick={reloadCurrent} disabled={loading||busy}><RefreshCw size={17} className={loading?"spin":""}/></button></div>{current&&<><img className="managed-qr" src={current.imageUrl} alt={t("Current customer QR code")}/><p className="qr-destination">{current.destination}</p><a className="qr-download" href={current.imageUrl} download={`gary-customer-connect-qr.${current.mode==="upload"?"png":"svg"}`}><ArrowDownToLine size={15}/>{t("Download QR code")}</a>{current.updatedAt&&<p className="staff-updated">{t("Last updated")}: {new Intl.DateTimeFormat(locale==="vi"?"vi-VN":"en-GB",{dateStyle:"medium",timeStyle:"short"}).format(new Date(current.updatedAt))}</p>}</>}<div className="staff-identity"><ShieldCheck size={14}/><span>{staff.email}</span><button type="button" onClick={signOut} disabled={busy} aria-label={t("Sign out")}><LogOut size={15}/></button></div></section><section className="form-card staff-editor"><h2>{t("Make the next connection.")}</h2><p className="section-description">{t("Generate a branded code for a new link, or upload your own QR image.")}</p><div className="staff-mode-options"><button type="button" aria-pressed={mode==="generate"} onClick={()=>{setMode("generate");setCandidate(null);}}><QrCode size={16}/>{t("Generate QR")}</button><button type="button" aria-pressed={mode==="upload"} onClick={()=>{setMode("upload");setCandidate(null);}}><Upload size={16}/>{t("Upload QR")}</button></div><div className="field"><label htmlFor="qr-destination">{t("QR destination")}</label><input id="qr-destination" type="url" value={destination} onChange={e=>{setDestination(e.target.value);setCandidate(null);}} maxLength={500}/><p className="field-hint">{t("Use the exact HTTPS link the QR code should open.")}</p></div>{mode==="upload"&&<div className="field staff-upload"><label htmlFor="qr-file"><ImagePlus size={17}/>{t("Choose a PNG QR image")}</label><input id="qr-file" type="file" accept="image/png" onChange={e=>{setFile(e.target.files?.[0]||null);setCandidate(null);}}/><p className="field-hint">{t("PNG only, up to 1 MB. Enter the destination already encoded in your uploaded image.")}</p></div>}<button className="staff-preview-button" type="button" onClick={preview} disabled={busy}>{t("Preview replacement")}<ArrowRight size={14}/></button>{candidate&&<div className="candidate-preview"><img src={candidate.imageUrl} alt={t("Replacement QR preview")}/><p>{candidate.destination}</p><span>{t("Scan this preview before saving.")}</span></div>}<p className="field-hint staff-print-note">{t("Replacing this image does not change QR codes already printed or downloaded.")}</p><div className="form-actions"><p>{t("The customer page will use the saved QR code.")}</p><button className="primary-button" type="button" onClick={save} disabled={!candidate||busy||loading}>{busy?<LoaderCircle className="spin" size={16}/>:<Check size={16}/>} {t(busy?"Saving…":"Save replacement")}</button></div></section></div>}
      {error&&<div className="submission-error staff-message" role="alert">{t(error)}</div>}{notice&&<div className="staff-notice" role="status"><Check size={17}/>{t(notice)}</div>}
    </main><footer className="site-footer"><span>© {new Date().getFullYear()} {t("Gary. Here for your next chapter.")}</span><Link href="/">{t("Customer connect")}</Link></footer></div>;
}
