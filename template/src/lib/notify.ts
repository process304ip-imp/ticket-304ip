/**
 * 304IP Notification Utility
 * รองรับ 3 ระดับ:
 *  1. In-app toast (ทำงานเสมอ)
 *  2. Browser Notification API (เมื่อ user อนุญาต)
 *  3. Service Worker Push (เมื่อ integrate กับ Supabase Realtime / Web Push)
 *  4. Sound Alerts via Web Audio API (no external audio files needed)
 */

export type NotifyPayload = {
  title: string;
  body: string;
  icon?: string;
  tag?: string;        // ป้องกัน duplicate notification
  data?: Record<string, unknown>;
  sound?: 'new-ticket' | 'update' | 'critical' | 'resolved' | false;
};

// -------------------------------------------------------
// Sound Alert Engine (Web Audio API — no external files)
// -------------------------------------------------------
let _audioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  try {
    if (!_audioCtx || _audioCtx.state === 'closed') {
      _audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    return _audioCtx;
  } catch {
    return null;
  }
}

/**
 * Play a soft professional chime using Web Audio API.
 * type: 'new-ticket' = ascending 3-note chime
 *       'update'     = single short ping
 *       'critical'   = urgent two-tone
 *       'resolved'   = gentle descending success
 */
export async function playChime(type: 'new-ticket' | 'update' | 'critical' | 'resolved' = 'update') {
  const ctx = getAudioContext();
  if (!ctx) return;

  // Resume AudioContext if suspended (browser autoplay policy)
  if (ctx.state === 'suspended') {
    try { await ctx.resume(); } catch { return; }
  }

  const now = ctx.currentTime;

  // Frequency maps for each chime type
  const sequences: { freq: number; start: number; duration: number; vol: number }[] = [];

  if (type === 'new-ticket') {
    // Ascending C-E-G major chord arpeggio (pleasant & professional)
    sequences.push(
      { freq: 523.25, start: 0,    duration: 0.18, vol: 0.22 },  // C5
      { freq: 659.25, start: 0.12, duration: 0.18, vol: 0.20 },  // E5
      { freq: 783.99, start: 0.24, duration: 0.28, vol: 0.18 },  // G5
    );
  } else if (type === 'critical') {
    // Urgent two-tone alarm
    sequences.push(
      { freq: 880,    start: 0,    duration: 0.12, vol: 0.28 },  // A5
      { freq: 1046.5, start: 0.14, duration: 0.12, vol: 0.28 },  // C6
      { freq: 880,    start: 0.28, duration: 0.12, vol: 0.28 },
      { freq: 1046.5, start: 0.42, duration: 0.15, vol: 0.28 },
    );
  } else if (type === 'resolved') {
    // Descending success melody
    sequences.push(
      { freq: 783.99, start: 0,    duration: 0.18, vol: 0.18 },  // G5
      { freq: 659.25, start: 0.12, duration: 0.18, vol: 0.16 },  // E5
      { freq: 523.25, start: 0.24, duration: 0.30, vol: 0.15 },  // C5
    );
  } else {
    // Single soft ping (update)
    sequences.push(
      { freq: 698.46, start: 0, duration: 0.20, vol: 0.15 },     // F5
    );
  }

  sequences.forEach(({ freq, start, duration, vol }) => {
    const osc = ctx!.createOscillator();
    const gain = ctx!.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, now + start);

    // Smooth envelope: quick attack, gentle decay
    gain.gain.setValueAtTime(0, now + start);
    gain.gain.linearRampToValueAtTime(vol, now + start + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, now + start + duration);

    osc.connect(gain);
    gain.connect(ctx!.destination);

    osc.start(now + start);
    osc.stop(now + start + duration + 0.05);
  });
}

// -------------------------------------------------------
// ขอ Permission (ควรเรียกหลัง user gesture เช่น login)
// -------------------------------------------------------
export async function requestNotificationPermission(): Promise<NotificationPermission> {
  if (!('Notification' in window)) return 'denied';
  if (Notification.permission === 'granted') return 'granted';
  if (Notification.permission === 'denied') return 'denied';
  return await Notification.requestPermission();
}

// -------------------------------------------------------
// แสดง Browser Notification ทันที
// -------------------------------------------------------
export function showBrowserNotification(payload: NotifyPayload) {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;

  const notification = new Notification(payload.title, {
    body: payload.body,
    icon: payload.icon ?? '/icon-192.png',
    badge: '/icon-192.png',
    tag: payload.tag,
    data: payload.data,
  });

  // คลิก notification → focus tab
  notification.onclick = () => {
    window.focus();
    notification.close();
  };
}

// -------------------------------------------------------
// แสดงผ่าน Service Worker (รองรับ background / mobile PWA)
// -------------------------------------------------------
export async function showSwNotification(payload: NotifyPayload) {
  if (!('serviceWorker' in navigator)) return;

  const registration = await navigator.serviceWorker.ready;

  await registration.showNotification(payload.title, {
    body: payload.body,
    icon: payload.icon ?? '/icon-192.png',
    badge: '/icon-192.png',
    tag: payload.tag,
    data: payload.data,
    // vibrate supported on Android (cast needed — not in TS lib types)
    ...({ vibrate: [200, 100, 200] } as unknown as NotificationOptions),
  } as NotificationOptions);
}

// -------------------------------------------------------
// Main function: เลือก SW หรือ Browser อัตโนมัติ
// -------------------------------------------------------
export async function notify(payload: NotifyPayload) {
  const perm = await requestNotificationPermission();
  if (perm !== 'granted') return;

  // ถ้า SW พร้อม → ใช้ SW (รองรับ background + mobile)
  if ('serviceWorker' in navigator) {
    try {
      await showSwNotification(payload);
      return;
    } catch {
      // fallback ไป browser notification
    }
  }

  showBrowserNotification(payload);
}

// -------------------------------------------------------
// Preset helpers สำหรับ Ticket events
// -------------------------------------------------------
export const ticketNotify = {
  newTicket: (ticketId: string, company: string) => {
    playChime('new-ticket');
    return notify({
      title: `🎫 Ticket ใหม่: ${ticketId}`,
      body: `${company} เปิด ticket ใหม่ รอ CRM รับเรื่อง`,
      tag: `ticket-new-${ticketId}`,
    });
  },

  assigned: (ticketId: string, team: string) => {
    playChime('update');
    return notify({
      title: `📋 Assign งานแล้ว: ${ticketId}`,
      body: `Ticket ถูก assign ให้ ${team} แล้ว`,
      tag: `ticket-assign-${ticketId}`,
    });
  },

  statusChanged: (ticketId: string, status: string) => {
    playChime('update');
    return notify({
      title: `🔄 อัปเดตสถานะ: ${ticketId}`,
      body: `Ticket เปลี่ยนสถานะเป็น ${status}`,
      tag: `ticket-status-${ticketId}`,
    });
  },

  resolved: (ticketId: string) => {
    playChime('resolved');
    return notify({
      title: `✅ งานเสร็จแล้ว: ${ticketId}`,
      body: `Ticket ถูก Resolved แล้ว กรุณา Feedback เพื่อปิดงาน`,
      tag: `ticket-resolved-${ticketId}`,
    });
  },

  critical: (ticketId: string, subCategory: string) => {
    playChime('critical');
    return notify({
      title: `🚨 CRITICAL: ${subCategory}`,
      body: `Ticket ${ticketId} ระดับ Critical ต้องการการตอบสนองทันที!`,
      tag: `ticket-critical-${ticketId}`,
    });
  },
};
