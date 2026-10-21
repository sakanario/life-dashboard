"use client";

import { useState } from "react";
import { api } from "@/lib/client-api";
import { Logo } from "@/components/logo";

export function LoginForm({ next, ready }: { next: string; ready: boolean }) {
  const [code, setCode] = useState("");
  // kode cadangan: buat kalau HP (authenticator) hilang
  const [backup, setBackup] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const clean = backup ? code.replace(/[\s-]/g, "") : code.replace(/\D/g, "");
  const complete = backup ? clean.length === 10 : clean.length === 6;

  return (
    <section className="panel login" aria-labelledby="login-h">
      <div className="brand" style={{ padding: 0 }}>
        <Logo size={44} />
        <div>
          <b>Life Dashboard</b>
          <div className="mono muted">login</div>
        </div>
      </div>
      {ready ? (
        <form
          className="jform"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!complete || busy) return;
            setBusy(true);
            setErr(null);
            try {
              const res = await api.login(clean);
              if (res.backupLeft !== null) alert(`Kode cadangan terpakai. Sisa ${res.backupLeft}. Bikin baru: node scripts/setup-totp.mjs --backup-codes`);
              // reload penuh: semua data server dimuat ulang pakai cookie baru
              location.assign(next);
            } catch (e2) {
              setErr((e2 as Error).message);
              setCode("");
              setBusy(false);
            }
          }}
        >
          <h1 id="login-h" style={{ fontSize: "1.3rem" }}>
            {backup ? "Masukin kode cadangan" : "Masukin kode authenticator"}
          </h1>
          <div className="jfield">
            <label htmlFor="code">{backup ? "Kode cadangan (10 karakter)" : "Kode 6 digit"}</label>
            <input
              key={backup ? "backup" : "totp"}
              type="text"
              id="code"
              className="mono"
              inputMode={backup ? "text" : "numeric"}
              autoComplete={backup ? "off" : "one-time-code"}
              autoCapitalize="characters"
              spellCheck={false}
              maxLength={backup ? 11 : 6}
              pattern={backup ? undefined : "[0-9]{6}"}
              autoFocus
              value={code}
              aria-invalid={!!err}
              aria-describedby={err ? "code-err" : undefined}
              onChange={(e) => setCode(backup ? e.target.value.toUpperCase() : e.target.value.replace(/\D/g, ""))}
            />
          </div>
          {err ? (
            <p id="code-err" className="login-err" role="alert">
              {err}
            </p>
          ) : null}
          <button className="btn primary" type="submit" disabled={busy || !complete}>
            {busy ? "Ngecek…" : "Masuk"}
          </button>
          <button
            type="button"
            className="btn"
            onClick={() => {
              setBackup(!backup);
              setCode("");
              setErr(null);
            }}
          >
            {backup ? "Pakai kode authenticator" : "HP hilang? Pakai kode cadangan"}
          </button>
          <p className="muted" style={{ margin: 0, fontSize: ".78rem" }}>
            Sesi berlaku 30 hari di browser ini.
          </p>
        </form>
      ) : (
        <div className="jform">
          <h1 id="login-h" style={{ fontSize: "1.3rem" }}>
            Authenticator belum diatur
          </h1>
          <p style={{ margin: 0 }}>
            Di PC ini, buka terminal di folder app lalu jalanin <span className="mono">node scripts/setup-totp.mjs</span>. Scan QR yang muncul pakai aplikasi authenticator di HP, restart server, lalu muat ulang halaman ini.
          </p>
          <p className="muted" style={{ margin: 0, fontSize: ".82rem" }}>
            Selama <span className="mono">TOTP_SECRET</span> / <span className="mono">SESSION_SECRET</span> kosong, semua halaman & API dikunci.
          </p>
        </div>
      )}
    </section>
  );
}
