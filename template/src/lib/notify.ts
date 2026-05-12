/**
 * 304IP Notification Utility
 * รองรับ 3 ระดับ:
 *  1. In-app toast (ทำงานเสมอ)
 *  2. Browser Notification API (เมื่อ user อนุญาต)
 *  3. Service Worker Push (เมื่อ integrate กับ Supabase Realtime / Web Push)
 */

export type NotifyPayload = {
  title: string;
  body: string;
  icon?: string;
  tag?: string;        // ป้องกัน duplicate notification
  data?: Record<string, unknown>;
};

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
  newTicket: (ticketId: string, company: string) =>
    notify({
      title: `🎫 Ticket ใหม่: ${ticketId}`,
      body: `${company} เปิด ticket ใหม่ รอ CRM รับเรื่อง`,
      tag: `ticket-new-${ticketId}`,
    }),

  assigned: (ticketId: string, team: string) =>
    notify({
      title: `📋 Assign งานแล้ว: ${ticketId}`,
      body: `Ticket ถูก assign ให้ ${team} แล้ว`,
      tag: `ticket-assign-${ticketId}`,
    }),

  statusChanged: (ticketId: string, status: string) =>
    notify({
      title: `🔄 อัปเดตสถานะ: ${ticketId}`,
      body: `Ticket เปลี่ยนสถานะเป็น ${status}`,
      tag: `ticket-status-${ticketId}`,
    }),

  resolved: (ticketId: string) =>
    notify({
      title: `✅ งานเสร็จแล้ว: ${ticketId}`,
      body: `Ticket ถูก Resolved แล้ว กรุณา Feedback เพื่อปิดงาน`,
      tag: `ticket-resolved-${ticketId}`,
    }),

  critical: (ticketId: string, subCategory: string) =>
    notify({
      title: `🚨 CRITICAL: ${subCategory}`,
      body: `Ticket ${ticketId} ระดับ Critical ต้องการการตอบสนองทันที!`,
      tag: `ticket-critical-${ticketId}`,
    }),
};
