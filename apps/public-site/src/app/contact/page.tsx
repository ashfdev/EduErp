'use client';

import { useEffect, useState } from 'react';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';
const TENANT_ID = process.env.NEXT_PUBLIC_TENANT_ID ?? '';

export default function ContactPage() {
  const [challenge, setChallenge] = useState<{ challengeId: string; question: string } | null>(null);
  const [form, setForm] = useState({ name: '', email: '', phone: '', message: '', captchaAnswer: '' });
  const [status, setStatus] = useState<string | null>(null);

  function loadCaptcha() {
    fetch(`${API_BASE}/api/v1/content/captcha`).then((r) => r.json()).then(setChallenge);
  }
  useEffect(loadCaptcha, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setStatus(null);
    if (!challenge) return;

    const res = await fetch(`${API_BASE}/api/v1/content/contact`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tenantId: TENANT_ID,
        name: form.name,
        email: form.email || undefined,
        phone: form.phone || undefined,
        message: form.message,
        challengeId: challenge.challengeId,
        captchaAnswer: Number(form.captchaAnswer),
      }),
    });

    if (res.ok) {
      setStatus('Message sent — thank you, we will get back to you soon.');
      setForm({ name: '', email: '', phone: '', message: '', captchaAnswer: '' });
      loadCaptcha();
    } else {
      const body = await res.json().catch(() => ({}));
      setStatus(body.error ?? 'Failed to send message');
      loadCaptcha();
    }
  }

  return (
    <div>
      <h1 className="mb-4 text-xl font-semibold">Contact Us</h1>
      <form onSubmit={submit} className="max-w-md space-y-3">
        <input required placeholder="Your name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="w-full rounded-md border px-3 py-2 text-sm" />
        <input type="email" placeholder="Email (optional)" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="w-full rounded-md border px-3 py-2 text-sm" />
        <input placeholder="Phone (optional)" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className="w-full rounded-md border px-3 py-2 text-sm" />
        <textarea required placeholder="Message" rows={4} value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} className="w-full rounded-md border px-3 py-2 text-sm" />

        {challenge && (
          <div>
            <label className="block text-sm text-gray-700">{challenge.question}</label>
            <input required value={form.captchaAnswer} onChange={(e) => setForm({ ...form, captchaAnswer: e.target.value })} className="mt-1 w-32 rounded-md border px-3 py-2 text-sm" />
          </div>
        )}

        {status && <p className="text-sm text-gray-700">{status}</p>}

        <button type="submit" className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">
          Send Message
        </button>
      </form>
    </div>
  );
}
