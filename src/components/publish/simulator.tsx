"use client";
import { ExternalLink, Monitor, Smartphone, Tablet } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { journey } from "@/lib/client/api";
import { cn } from "@/lib/utils";

const DEVICES = {
  desktop: { label: "Desktop", w: 1280, h: 860, icon: Monitor },
  tablet: { label: "Tablet", w: 820, h: 1080, icon: Tablet },
  mobile: { label: "Mobile", w: 390, h: 800, icon: Smartphone },
} as const;
type Device = keyof typeof DEVICES;

export function DeviceSimulator({ articleId, hasPublished, liveUrl }: { articleId: string; hasPublished: boolean; liveUrl: string | null }) {
  const [device, setDevice] = useState<Device>("desktop");
  const [version, setVersion] = useState<"working" | "published">(hasPublished ? "published" : "working");
  const box = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const d = DEVICES[device];

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setScale(Math.min(1, (el.clientWidth - 32) / d.w)));
    ro.observe(el);
    return () => ro.disconnect();
  }, [d.w]);

  useEffect(() => {
    if (version === "published" && hasPublished) journey("site_viewed");
  }, [version, hasPublished]);

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <div role="radiogroup" aria-label="表示デバイス" className="inline-flex border border-line-strong bg-white">
          {(Object.keys(DEVICES) as Device[]).map((k) => {
            const D = DEVICES[k];
            return (
              <button key={k} role="radio" aria-checked={device === k} onClick={() => setDevice(k)} className={cn("inline-flex items-center gap-1.5 border-l border-line px-3 py-1.5 text-xs first:border-l-0", device === k ? "bg-navy text-white" : "text-ink-2 hover:bg-ivory-2")} data-testid={`device-${k}`}>
                <D.icon className="size-3.5" />{D.label}
              </button>
            );
          })}
        </div>
        <div role="radiogroup" aria-label="表示する版" className="inline-flex border border-line-strong bg-white">
          <button role="radio" aria-checked={version === "published"} disabled={!hasPublished} onClick={() => setVersion("published")} className={cn("px-3 py-1.5 text-xs disabled:opacity-40", version === "published" ? "bg-navy text-white" : "text-ink-2 hover:bg-ivory-2")} data-testid="version-published">公開版</button>
          <button role="radio" aria-checked={version === "working"} onClick={() => setVersion("working")} className={cn("border-l border-line px-3 py-1.5 text-xs", version === "working" ? "bg-navy text-white" : "text-ink-2 hover:bg-ivory-2")} data-testid="version-working">最新版（承認前プレビュー）</button>
        </div>
        <span className="font-num text-[11px] text-slate tnum">{d.w}×{d.h}{scale < 1 && ` · ${Math.round(scale * 100)}%`}</span>
        {liveUrl && <a href={liveUrl} target="_blank" rel="noopener noreferrer" className="ml-auto inline-flex items-center gap-1 text-xs text-navy hover:underline" data-testid="live-url">公開URLを開く <ExternalLink className="size-3" /></a>}
      </div>
      <div ref={box} className="grid-paper flex justify-center overflow-hidden bg-navy px-4 py-6" style={{ height: d.h * scale + 48 }}>
        <div style={{ width: d.w * scale, height: d.h * scale }} className="shrink-0">
          <div className={cn("origin-top-left overflow-hidden bg-white shadow-frame", device === "mobile" && "rounded-[28px] ring-[10px] ring-black/80", device === "tablet" && "rounded-[18px] ring-[10px] ring-black/70")} style={{ width: d.w, height: d.h, transform: `scale(${scale})` }}>
            <iframe key={`${version}-${device}`} title={`公開ページのプレビュー（${d.label}・${version === "published" ? "公開版" : "最新版"}）`} src={`/preview-frame/${articleId}?v=${version}`} className="size-full border-0" data-testid="preview-iframe" />
          </div>
        </div>
      </div>
    </div>
  );
}
