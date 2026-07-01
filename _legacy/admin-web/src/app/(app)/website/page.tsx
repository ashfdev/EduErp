'use client';

import { useEffect, useState } from 'react';
import { Button } from '@education-erp/ui';
import { api } from '@/lib/api';

const TABS = ['Notices', 'Pages', 'Sliders', 'Gallery', 'Downloads', 'Authority & Committee', 'Events', 'Contact'] as const;
type Tab = (typeof TABS)[number];

export default function WebsitePage() {
  const [tab, setTab] = useState<Tab>('Notices');

  return (
    <div>
      <h1 className="text-xl font-semibold">Website Maintenance</h1>

      <div className="mt-4 flex flex-wrap gap-2 border-b">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-3 py-2 text-sm ${tab === t ? 'border-b-2 border-blue-600 font-medium text-blue-700' : 'text-gray-500'}`}
          >
            {t}
          </button>
        ))}
      </div>

      <div className="mt-4">
        {tab === 'Notices' && <NoticesTab />}
        {tab === 'Pages' && <PagesTab />}
        {tab === 'Sliders' && <SlidersTab />}
        {tab === 'Gallery' && <GalleryTab />}
        {tab === 'Downloads' && <DownloadsTab />}
        {tab === 'Authority & Committee' && <AuthorityCommitteeTab />}
        {tab === 'Events' && <EventsTab />}
        {tab === 'Contact' && <ContactTab />}
      </div>
    </div>
  );
}

interface Notice {
  id: string; title: string; body: string; audience: string; isPinned: boolean; isPublishedWebsite: boolean; sendSms: boolean;
}

function NoticesTab() {
  const [notices, setNotices] = useState<Notice[]>([]);
  const [form, setForm] = useState({ title: '', body: '', audience: 'PUBLIC', isPinned: false, isPublishedWebsite: true, sendSms: false });

  function load() {
    api.get<Notice[]>('/api/v1/website/notices').then(setNotices).catch(console.error);
  }
  useEffect(load, []);

  async function create() {
    await api.post('/api/v1/website/notices', form);
    setForm({ ...form, title: '', body: '' });
    load();
  }

  async function remove(id: string) {
    await api.delete(`/api/v1/website/notices/${id}`);
    load();
  }

  return (
    <div>
      <ul className="divide-y text-sm">
        {notices.map((n) => (
          <li key={n.id} className="flex items-center justify-between py-2">
            <span>
              {n.isPinned && '📌 '}{n.title} <span className="text-gray-500">({n.audience}{n.isPublishedWebsite ? ', on website' : ''})</span>
            </span>
            <button onClick={() => remove(n.id)} className="text-red-600 hover:underline">Delete</button>
          </li>
        ))}
      </ul>

      <div className="mt-4 max-w-lg space-y-2 rounded-md border p-4">
        <h3 className="font-medium">New Notice</h3>
        <input placeholder="Title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className="w-full rounded-md border px-2 py-1 text-sm" />
        <textarea placeholder="Body" value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} className="w-full rounded-md border px-2 py-1 text-sm" rows={3} />
        <select value={form.audience} onChange={(e) => setForm({ ...form, audience: e.target.value })} className="rounded-md border px-2 py-1 text-sm">
          {['PUBLIC', 'STUDENTS', 'STAFF', 'GUARDIANS'].map((a) => <option key={a} value={a}>{a}</option>)}
        </select>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={form.isPinned} onChange={(e) => setForm({ ...form, isPinned: e.target.checked })} /> Pin to top
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={form.isPublishedWebsite} onChange={(e) => setForm({ ...form, isPublishedWebsite: e.target.checked })} /> Show on public website
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={form.sendSms} onChange={(e) => setForm({ ...form, sendSms: e.target.checked })} /> Send SMS blast to guardians
        </label>
        <Button onClick={create}>Publish Notice</Button>
      </div>
    </div>
  );
}

interface Page { id: string; slug: string; title: string; bodyHtml: string; isPublished: boolean }

function PagesTab() {
  const [pages, setPages] = useState<Page[]>([]);
  const [form, setForm] = useState({ slug: '', title: '', bodyHtml: '', isPublished: true });

  function load() {
    api.get<Page[]>('/api/v1/website/pages').then(setPages).catch(console.error);
  }
  useEffect(load, []);

  async function create() {
    await api.post('/api/v1/website/pages', form);
    setForm({ slug: '', title: '', bodyHtml: '', isPublished: true });
    load();
  }

  return (
    <div>
      <ul className="divide-y text-sm">
        {pages.map((p) => (
          <li key={p.id} className="py-2">/{p.slug} — {p.title} {p.isPublished ? '' : '(draft)'}</li>
        ))}
      </ul>

      <div className="mt-4 max-w-lg space-y-2 rounded-md border p-4">
        <h3 className="font-medium">New Page</h3>
        <input placeholder="Slug (e.g. about-us)" value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value })} className="w-full rounded-md border px-2 py-1 text-sm" />
        <input placeholder="Title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className="w-full rounded-md border px-2 py-1 text-sm" />
        <textarea placeholder="Body HTML" value={form.bodyHtml} onChange={(e) => setForm({ ...form, bodyHtml: e.target.value })} className="w-full rounded-md border px-2 py-1 text-sm" rows={5} />
        <Button onClick={create}>Save Page</Button>
      </div>
    </div>
  );
}

interface Slider { id: string; imageUrl: string; title: string | null; isActive: boolean }

function SlidersTab() {
  const [slides, setSlides] = useState<Slider[]>([]);
  const [form, setForm] = useState({ imageUrl: '', title: '', subtitle: '' });

  function load() {
    api.get<Slider[]>('/api/v1/website/sliders').then(setSlides).catch(console.error);
  }
  useEffect(load, []);

  async function create() {
    await api.post('/api/v1/website/sliders', form);
    setForm({ imageUrl: '', title: '', subtitle: '' });
    load();
  }

  async function remove(id: string) {
    await api.delete(`/api/v1/website/sliders/${id}`);
    load();
  }

  return (
    <div>
      <ul className="divide-y text-sm">
        {slides.map((s) => (
          <li key={s.id} className="flex items-center justify-between py-2">
            <span>{s.title ?? '(untitled)'} — {s.imageUrl}</span>
            <button onClick={() => remove(s.id)} className="text-red-600 hover:underline">Delete</button>
          </li>
        ))}
      </ul>
      <div className="mt-4 max-w-lg space-y-2 rounded-md border p-4">
        <h3 className="font-medium">New Slide</h3>
        <input placeholder="Image URL" value={form.imageUrl} onChange={(e) => setForm({ ...form, imageUrl: e.target.value })} className="w-full rounded-md border px-2 py-1 text-sm" />
        <input placeholder="Title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className="w-full rounded-md border px-2 py-1 text-sm" />
        <input placeholder="Subtitle" value={form.subtitle} onChange={(e) => setForm({ ...form, subtitle: e.target.value })} className="w-full rounded-md border px-2 py-1 text-sm" />
        <Button onClick={create}>Add Slide</Button>
      </div>
    </div>
  );
}

interface Album { id: string; name: string; isPublic: boolean; images: { id: string; imageUrl: string }[] }

function GalleryTab() {
  const [albums, setAlbums] = useState<Album[]>([]);
  const [name, setName] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [selectedAlbum, setSelectedAlbum] = useState('');

  function load() {
    api.get<Album[]>('/api/v1/website/gallery/albums').then(setAlbums).catch(console.error);
  }
  useEffect(load, []);

  async function createAlbum() {
    await api.post('/api/v1/website/gallery/albums', { name });
    setName('');
    load();
  }

  async function addImage() {
    if (!selectedAlbum || !imageUrl) return;
    await api.post(`/api/v1/website/gallery/albums/${selectedAlbum}/images`, { imageUrl });
    setImageUrl('');
    load();
  }

  return (
    <div>
      {albums.map((a) => (
        <div key={a.id} className="mb-2 rounded-md border p-3 text-sm">
          <strong>{a.name}</strong> ({a.images.length} photos)
        </div>
      ))}

      <div className="mt-4 grid max-w-lg gap-4">
        <div className="space-y-2 rounded-md border p-4">
          <h3 className="font-medium">New Album</h3>
          <input placeholder="Album name" value={name} onChange={(e) => setName(e.target.value)} className="w-full rounded-md border px-2 py-1 text-sm" />
          <Button onClick={createAlbum}>Create Album</Button>
        </div>
        <div className="space-y-2 rounded-md border p-4">
          <h3 className="font-medium">Add Photo to Album</h3>
          <select value={selectedAlbum} onChange={(e) => setSelectedAlbum(e.target.value)} className="w-full rounded-md border px-2 py-1 text-sm">
            <option value="">Select album…</option>
            {albums.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
          <input placeholder="Image URL" value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} className="w-full rounded-md border px-2 py-1 text-sm" />
          <Button onClick={addImage}>Add Photo</Button>
        </div>
      </div>
    </div>
  );
}

interface DownloadFile { id: string; title: string; category: string; fileUrl: string }

function DownloadsTab() {
  const [files, setFiles] = useState<DownloadFile[]>([]);
  const [form, setForm] = useState({ title: '', category: 'SYLLABUS', fileUrl: '' });

  function load() {
    api.get<DownloadFile[]>('/api/v1/website/downloads').then(setFiles).catch(console.error);
  }
  useEffect(load, []);

  async function create() {
    await api.post('/api/v1/website/downloads', form);
    setForm({ title: '', category: 'SYLLABUS', fileUrl: '' });
    load();
  }

  return (
    <div>
      <ul className="divide-y text-sm">
        {files.map((f) => <li key={f.id} className="py-2">[{f.category}] {f.title}</li>)}
      </ul>
      <div className="mt-4 max-w-lg space-y-2 rounded-md border p-4">
        <h3 className="font-medium">New Download</h3>
        <input placeholder="Title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className="w-full rounded-md border px-2 py-1 text-sm" />
        <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className="w-full rounded-md border px-2 py-1 text-sm">
          {['SYLLABUS', 'FORMS', 'RESULTS', 'CIRCULARS', 'OTHERS'].map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <input placeholder="File URL" value={form.fileUrl} onChange={(e) => setForm({ ...form, fileUrl: e.target.value })} className="w-full rounded-md border px-2 py-1 text-sm" />
        <Button onClick={create}>Add File</Button>
      </div>
    </div>
  );
}

interface AuthorityMessage { id: string; name: string; designation: string; messageBody: string }
interface CommitteeMember { id: string; groupName: string; name: string; designation: string }

function AuthorityCommitteeTab() {
  const [messages, setMessages] = useState<AuthorityMessage[]>([]);
  const [members, setMembers] = useState<CommitteeMember[]>([]);
  const [msgForm, setMsgForm] = useState({ name: '', designation: '', messageBody: '' });
  const [memberForm, setMemberForm] = useState({ groupName: 'GOVERNING_BODY', name: '', designation: '' });

  function load() {
    api.get<AuthorityMessage[]>('/api/v1/website/authority-messages').then(setMessages).catch(console.error);
    api.get<CommitteeMember[]>('/api/v1/website/committee-members').then(setMembers).catch(console.error);
  }
  useEffect(load, []);

  async function addMessage() {
    await api.post('/api/v1/website/authority-messages', msgForm);
    setMsgForm({ name: '', designation: '', messageBody: '' });
    load();
  }

  async function addMember() {
    await api.post('/api/v1/website/committee-members', memberForm);
    setMemberForm({ ...memberForm, name: '', designation: '' });
    load();
  }

  return (
    <div className="grid grid-cols-2 gap-6">
      <section>
        <h3 className="mb-2 font-medium">Authority Messages</h3>
        <ul className="mb-3 divide-y text-sm">
          {messages.map((m) => <li key={m.id} className="py-2">{m.name} — {m.designation}</li>)}
        </ul>
        <div className="space-y-2 rounded-md border p-3">
          <input placeholder="Name" value={msgForm.name} onChange={(e) => setMsgForm({ ...msgForm, name: e.target.value })} className="w-full rounded-md border px-2 py-1 text-sm" />
          <input placeholder="Designation" value={msgForm.designation} onChange={(e) => setMsgForm({ ...msgForm, designation: e.target.value })} className="w-full rounded-md border px-2 py-1 text-sm" />
          <textarea placeholder="Message" value={msgForm.messageBody} onChange={(e) => setMsgForm({ ...msgForm, messageBody: e.target.value })} className="w-full rounded-md border px-2 py-1 text-sm" rows={2} />
          <Button onClick={addMessage}>Add Message</Button>
        </div>
      </section>

      <section>
        <h3 className="mb-2 font-medium">Governing Body / Committee</h3>
        <ul className="mb-3 divide-y text-sm">
          {members.map((m) => <li key={m.id} className="py-2">[{m.groupName}] {m.name} — {m.designation}</li>)}
        </ul>
        <div className="space-y-2 rounded-md border p-3">
          <select value={memberForm.groupName} onChange={(e) => setMemberForm({ ...memberForm, groupName: e.target.value })} className="w-full rounded-md border px-2 py-1 text-sm">
            {['GOVERNING_BODY', 'ACADEMIC_COUNCIL', 'FINANCE_COMMITTEE'].map((g) => <option key={g} value={g}>{g}</option>)}
          </select>
          <input placeholder="Name" value={memberForm.name} onChange={(e) => setMemberForm({ ...memberForm, name: e.target.value })} className="w-full rounded-md border px-2 py-1 text-sm" />
          <input placeholder="Designation" value={memberForm.designation} onChange={(e) => setMemberForm({ ...memberForm, designation: e.target.value })} className="w-full rounded-md border px-2 py-1 text-sm" />
          <Button onClick={addMember}>Add Member</Button>
        </div>
      </section>
    </div>
  );
}

interface SchoolEvent { id: string; name: string; startDate: string; endDate: string; type: string }

function EventsTab() {
  const [events, setEvents] = useState<SchoolEvent[]>([]);
  const [form, setForm] = useState({ name: '', startDate: '', endDate: '', type: 'HOLIDAY' });

  function load() {
    api.get<SchoolEvent[]>('/api/v1/website/events').then(setEvents).catch(console.error);
  }
  useEffect(load, []);

  async function create() {
    await api.post('/api/v1/website/events', form);
    setForm({ ...form, name: '' });
    load();
  }

  return (
    <div>
      <ul className="divide-y text-sm">
        {events.map((e) => (
          <li key={e.id} className="py-2">[{e.type}] {e.name} — {e.startDate.slice(0, 10)} to {e.endDate.slice(0, 10)}</li>
        ))}
      </ul>
      <div className="mt-4 max-w-lg space-y-2 rounded-md border p-4">
        <h3 className="font-medium">New Event</h3>
        <input placeholder="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="w-full rounded-md border px-2 py-1 text-sm" />
        <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} className="w-full rounded-md border px-2 py-1 text-sm">
          {['HOLIDAY', 'EXAM', 'CULTURAL', 'SPORTS', 'PARENT_MEETING'].map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        <div className="flex gap-2">
          <input type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} className="w-full rounded-md border px-2 py-1 text-sm" />
          <input type="date" value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} className="w-full rounded-md border px-2 py-1 text-sm" />
        </div>
        <Button onClick={create}>Add Event</Button>
      </div>
    </div>
  );
}

interface ContactMessage { id: string; name: string; email: string | null; message: string; isRead: boolean }

function ContactTab() {
  const [tenant, setTenant] = useState({ address: '', mapEmbedCode: '', facebookUrl: '', youtubeUrl: '' });
  const [messages, setMessages] = useState<ContactMessage[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.get<{ address: string | null; mapEmbedCode: string | null; facebookUrl: string | null; youtubeUrl: string | null }>('/api/v1/settings/tenant').then((t) =>
      setTenant({ address: t.address ?? '', mapEmbedCode: t.mapEmbedCode ?? '', facebookUrl: t.facebookUrl ?? '', youtubeUrl: t.youtubeUrl ?? '' }),
    );
    loadMessages();
  }, []);

  function loadMessages() {
    api.get<ContactMessage[]>('/api/v1/website/contact-messages').then(setMessages).catch(console.error);
  }

  async function save() {
    setSaving(true);
    try {
      await api.patch('/api/v1/website/contact-settings', tenant);
    } finally {
      setSaving(false);
    }
  }

  async function markRead(id: string) {
    await api.patch(`/api/v1/website/contact-messages/${id}/read`, {});
    loadMessages();
  }

  return (
    <div className="grid grid-cols-2 gap-6">
      <section className="max-w-md space-y-2">
        <h3 className="font-medium">Contact &amp; Social Settings</h3>
        <input placeholder="Address" value={tenant.address} onChange={(e) => setTenant({ ...tenant, address: e.target.value })} className="w-full rounded-md border px-2 py-1 text-sm" />
        <input placeholder="Map embed code" value={tenant.mapEmbedCode} onChange={(e) => setTenant({ ...tenant, mapEmbedCode: e.target.value })} className="w-full rounded-md border px-2 py-1 text-sm" />
        <input placeholder="Facebook URL" value={tenant.facebookUrl} onChange={(e) => setTenant({ ...tenant, facebookUrl: e.target.value })} className="w-full rounded-md border px-2 py-1 text-sm" />
        <input placeholder="YouTube URL" value={tenant.youtubeUrl} onChange={(e) => setTenant({ ...tenant, youtubeUrl: e.target.value })} className="w-full rounded-md border px-2 py-1 text-sm" />
        <Button onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save'}</Button>
      </section>

      <section>
        <h3 className="mb-2 font-medium">Contact Form Inbox</h3>
        <ul className="divide-y text-sm">
          {messages.map((m) => (
            <li key={m.id} className={`py-2 ${m.isRead ? 'text-gray-500' : ''}`}>
              <div className="flex items-center justify-between">
                <strong>{m.name}</strong>
                {!m.isRead && <button onClick={() => markRead(m.id)} className="text-blue-600 hover:underline">Mark read</button>}
              </div>
              <div>{m.email}</div>
              <div>{m.message}</div>
            </li>
          ))}
          {messages.length === 0 && <li className="py-2 text-gray-500">No messages yet.</li>}
        </ul>
      </section>
    </div>
  );
}
