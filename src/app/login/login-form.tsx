"use client";
import { ArrowRight, Eye, EyeOff, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import { api, ClientApiError } from "@/lib/client/api";
import { cn } from "@/lib/utils";

const field =
  "h-11 w-full rounded-[3px] border border-line-strong bg-white px-3.5 text-[15px] text-ink shadow-[inset_0_1px_1px_rgba(16,28,48,0.04)] transition-colors placeholder:text-slate/80 hover:border-ink-3/40 focus:border-navy focus:outline-none focus:ring-[3px] focus:ring-gold/25";

export function LoginForm() {
  const router = useRouter();
  const id = useId();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [caps, setCaps] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      setError("メールアドレスとパスワードを入力してください。");
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const r = await api<{ redirect: string }>("/api/auth/login", { body: { email, password } });
      router.push(r.redirect);
      router.refresh();
    } catch (err) {
      setError(err instanceof ClientApiError ? err.message : "ログインに失敗しました");
      setLoading(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-5" noValidate>
      <div>
        <label htmlFor={`${id}-email`} className="mb-1.5 block text-[13px] font-medium text-ink-2">メールアドレス</label>
        <input
          id={`${id}-email`}
          type="email"
          inputMode="email"
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          placeholder="name@firm.example"
          className={field}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          aria-invalid={!!error || undefined}
        />
      </div>
      <div>
        <label htmlFor={`${id}-password`} className="mb-1.5 block text-[13px] font-medium text-ink-2">パスワード</label>
        <div className="relative">
          <input
            id={`${id}-password`}
            type={show ? "text" : "password"}
            autoComplete="current-password"
            className={cn(field, "pr-12")}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyUp={(e) => setCaps(e.getModifierState("CapsLock"))}
            onBlur={() => setCaps(false)}
            aria-invalid={!!error || undefined}
            aria-describedby={caps ? `${id}-caps` : undefined}
          />
          <button
            type="button"
            onClick={() => setShow((v) => !v)}
            className="absolute inset-y-0 right-0 flex w-11 items-center justify-center text-slate transition-colors hover:text-ink"
            aria-label={show ? "入力した文字を隠す" : "入力した文字を表示"}
            aria-pressed={show}
          >
            {show ? <EyeOff className="size-[18px]" /> : <Eye className="size-[18px]" />}
          </button>
        </div>
        {caps && <p id={`${id}-caps`} className="mt-1.5 text-xs text-st-revision">Caps Lock がオンになっています</p>}
      </div>

      {error && (
        <p role="alert" className="flex gap-2 border-l-2 border-st-suspended bg-st-suspended/[0.06] px-3 py-2.5 text-[13px] leading-relaxed text-st-suspended">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={loading}
        className="group relative flex h-12 w-full items-center justify-center gap-2 overflow-hidden rounded-[3px] bg-navy text-[15px] font-medium tracking-wide text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.10),0_1px_2px_rgba(16,28,48,0.25)] transition-colors hover:bg-navy-2 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-gold/50 disabled:opacity-70"
      >
        <span className="absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-gold/70 to-transparent" aria-hidden />
        {loading ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
        ログイン
        {!loading && <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" aria-hidden />}
      </button>
    </form>
  );
}
