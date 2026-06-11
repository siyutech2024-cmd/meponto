/**
 * Support ticket domain — the friendly contact channel.
 * Riders open tickets in the rider app, franchise/station staff in their
 * panels; HQ answers everything from one queue at /support.
 */

export type SupportChannel = "rider" | "franchise" | "station" | "partner" | "web";
export type SupportStatus = "open" | "answered" | "resolved";

export type SupportTicket = {
  id: string;
  channel: SupportChannel;
  authorName: string;
  /** WhatsApp / phone / e-mail the author wants to be reached at. */
  contact: string;
  /** Franchise / station the author belongs to, when known. */
  organization?: string;
  subject: string;
  message: string;
  status: SupportStatus;
  createdAt: string;
  reply?: string;
  repliedAt?: string;
  repliedBy?: string;
  resolvedAt?: string;
};

export const supportTickets: SupportTicket[] = [];
