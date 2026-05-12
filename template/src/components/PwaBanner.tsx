import React, { useEffect, useState } from 'react';
import { BellOff, BellRing, Download, X } from 'lucide-react';
import { requestNotificationPermission } from '../lib/notify';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export function PwaBanner() {
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [notifPerm, setNotifPerm] = useState<NotificationPermission>('default');
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    // capture install prompt
    const handler = (e: Event) => {
      e.preventDefault();
      setInstallPrompt(e as BeforeInstallPromptEvent);
    };
    window.addEventListener('beforeinstallprompt', handler);

    // sync notification permission state
    if ('Notification' in window) {
      setNotifPerm(Notification.permission);
    }

    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const handleInstall = async () => {
    if (!installPrompt) return;
    await installPrompt.prompt();
    const result = await installPrompt.userChoice;
    if (result.outcome === 'accepted') setInstallPrompt(null);
  };

  const handleEnableNotif = async () => {
    const perm = await requestNotificationPermission();
    setNotifPerm(perm);
  };

  // ไม่แสดงถ้า dismiss แล้ว หรือทุกอย่างพร้อมแล้ว
  const showInstall = !!installPrompt;
  const showNotif = notifPerm === 'default';
  if (dismissed || (!showInstall && !showNotif)) return null;

  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 w-[calc(100%-2rem)] max-w-md">
      <div className="bg-primary text-white rounded-2xl shadow-2xl p-4 flex flex-col gap-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="font-black text-sm">304IP CRM พร้อมใช้งานแบบ App</p>
            <p className="text-blue-200 text-xs mt-0.5">ติดตั้งบนมือถือ/คอม เพื่อรับแจ้งเตือนแบบ Real-time</p>
          </div>
          <button onClick={() => setDismissed(true)} className="text-blue-300 hover:text-white shrink-0 mt-0.5">
            <X size={18} />
          </button>
        </div>

        <div className="flex gap-2">
          {showNotif && (
            <button
              onClick={handleEnableNotif}
              className="flex-1 bg-white/15 hover:bg-white/25 border border-white/20 text-white text-xs font-bold py-2.5 rounded-xl flex items-center justify-center gap-2 transition-colors"
            >
              {notifPerm === 'granted' ? <BellRing size={15} /> : <BellOff size={15} />}
              {notifPerm === 'granted' ? 'Notification เปิดแล้ว' : 'เปิดการแจ้งเตือน'}
            </button>
          )}
          {showInstall && (
            <button
              onClick={handleInstall}
              className="flex-1 bg-white text-primary text-xs font-black py-2.5 rounded-xl flex items-center justify-center gap-2 hover:bg-blue-50 transition-colors"
            >
              <Download size={15} />
              ติดตั้งแอป
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
