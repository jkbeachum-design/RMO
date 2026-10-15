import { SUPPORT_EMAIL, SUPPORT_NAME, SUPPORT_PHONE, SUPPORT_PHONE_DISPLAY } from '@/lib/support';

export default function HelpContact() {
  return (
    <div className="space-y-3">
      <p>
        Tap the <strong>? Help</strong> button (bottom right of any page) and ask a question in plain words.
      </p>
      <p>Something confusing or broken? Contact {SUPPORT_NAME}. A screenshot helps.</p>
      <div className="flex flex-col gap-2 sm:flex-row">
        <a href={`sms:${SUPPORT_PHONE}`} className="border border-slate-300 bg-white px-4 py-3 text-center font-semibold">Text {SUPPORT_PHONE_DISPLAY}</a>
        <a href={`tel:${SUPPORT_PHONE}`} className="border border-slate-300 bg-white px-4 py-3 text-center font-semibold">Call</a>
        <a href={`mailto:${SUPPORT_EMAIL}?subject=RMO%20Compliance%20feedback`} className="border border-slate-300 bg-white px-4 py-3 text-center font-semibold">Email</a>
      </div>
    </div>
  );
}
