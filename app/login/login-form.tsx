"use client";

import { useState } from "react";
import { api } from "@/lib/client-api";

export function LoginForm({ next, ready }: { next: string; ready: boolean }) {
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  return (
    <section className="panel login" aria-labelledby="login-h">
      <div className="brand" style={{ padding: 0 }}>
        <div className="brand-mark">S</div>
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
            if (!pin.trim() || busy) return;
            setBusy(true);
            setErr(null);
            try {
              await api.login(pin);
              // reload penuh: semua data server dimuat ulang pakai cookie baru
              location.assign(next);
            } catch (e2) {
              setErr((e2 as Error).message);
              setPin("");
              setBusy(false);
            }
          }}
        >
          <h1 id="login-h" style={{ fontSize: "1.3rem" }}>
            Masukin PIN
          </h1>
          <div className="jfield">
            <label htmlFor="pin">PIN</label>
            <input
              type="password"
              id="pin"
              inputMode="numeric"
              autoComplete="current-password"
              autoFocus
              value={pin}
              aria-invalid={!!err}
              aria-describedby={err ? "pin-err" : undefined}
              onChange={(e) => setPin(e.target.value)}
            />
          </div>
          {err ? (
            <p id="pin-err" className="login-err" role="alert">
              {err}
            </p>
          ) : null}
          <button className="btn primary" type="submit" disabled={busy || !pin.trim()}>
            {busy ? "Ngecek…" : "Masuk"}
          </button>
          <p className="muted" style={{ margin: 0, fontSize: ".78rem" }}>
            Sesi berlaku 30 hari di browser ini.
          </p>
        </form>
      ) : (
        <div className="jform">
          <h1 id="login-h" style={{ fontSize: "1.3rem" }}>
            PIN belum diatur
          </h1>
          <p style={{ margin: 0 }}>
            Isi <span className="mono">APP_PIN</span> di file <span className="mono">.env</span> folder app (contoh: <span className="mono">APP_PIN=</span> diikuti 6 digit pilihanmu), simpan, lalu muat ulang halaman ini.
          </p>
          <p className="muted" style={{ margin: 0, fontSize: ".82rem" }}>
            Selama PIN kosong, semua halaman & API dikunci.
          </p>
        </div>
      )}
    </section>
  );
}
