"use client";

import { useEffect, useRef, useState } from "react";
import { GaryAppsMenu } from "@/shared/gary-apps/gary-apps";
import { connectGaryApps, type GaryRuntimeProps } from "@/shared/gary-apps/client.js";

export function CustomerServiceAppsMenu({ language, className = "" }: Pick<GaryRuntimeProps, "language" | "className">) {
  const host = useRef<HTMLDivElement>(null), target = useRef<HTMLDivElement>(null);
  const connection = useRef<ReturnType<typeof connectGaryApps> | null>(null);
  const initial = useRef({ kind: "menu" as const, language, className });
  const [ready, setReady] = useState(false);
  useEffect(() => {
    if (!target.current) return;
    // Customer Connect is a separate site: all three services use external links.
    connection.current = connectGaryApps(target.current, initial.current, {
      onReady: () => setReady(true),
      isBusy: () => !!host.current?.querySelector("details[open]") || !!host.current?.contains(document.activeElement),
    });
    return () => { connection.current?.unmount(); connection.current = null; };
  }, []);
  useEffect(() => { connection.current?.update({ language, className }); }, [language, className]);
  return <div ref={host} style={{ display: "contents" }} data-gary-apps-host="customer-connect">
    {!ready && <GaryAppsMenu language={language} className={className}/>}
    <div ref={target} style={{ display: "contents" }} data-gary-apps-remote="customer-connect"/>
  </div>;
}
