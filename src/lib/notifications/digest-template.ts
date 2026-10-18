/**
 * Weekly digest email templates (HTML + plain text).
 *
 * Renders a digest of pipeline activity for the week: hot leads, stuck
 * contacts, follow-ups due, and recent replies.
 */

export type DigestData = {
  weekOf: string;
  ownerName: string;
  hotLeads: Array<{ id: string; businessName: string; stage: string; score?: number }>;
  stuckContacts: Array<{ id: string; businessName: string; daysSinceContact: number }>;
  followUpsDue: Array<{ id: string; businessName: string; dueAt: string }>;
  recentReplies: Array<{ id: string; businessName: string; sentiment?: string }>;
  totalLeads: number;
};

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function buildWeeklyDigestHtml(data: DigestData): string {
  const parts: string[] = [];
  parts.push(
    `<h1>DWN Lead Engine — Weekly Digest</h1>`,
    `<p style="color:#666">Week of ${escapeHtml(data.weekOf)} · Hi ${escapeHtml(data.ownerName)}</p>`
  );

  parts.push(`<h2>Hot leads (${data.hotLeads.length})</h2>`);
  if (data.hotLeads.length === 0) {
    parts.push("<p>No hot leads this week.</p>");
  } else {
    parts.push("<ul>");
    for (const l of data.hotLeads) {
      const scoreNote = l.score != null ? ` · score ${l.score}` : "";
      parts.push(
        `<li>${escapeHtml(l.businessName)} — ${escapeHtml(l.stage)}${scoreNote}</li>`
      );
    }
    parts.push("</ul>");
  }

  parts.push(`<h2>Stuck contacts (${data.stuckContacts.length})</h2>`);
  if (data.stuckContacts.length === 0) {
    parts.push("<p>No stuck contacts.</p>");
  } else {
    parts.push("<ul>");
    for (const l of data.stuckContacts) {
      parts.push(
        `<li>${escapeHtml(l.businessName)} — ${l.daysSinceContact}d since last contact</li>`
      );
    }
    parts.push("</ul>");
  }

  parts.push(`<h2>Follow-ups due (${data.followUpsDue.length})</h2>`);
  if (data.followUpsDue.length === 0) {
    parts.push("<p>No follow-ups due.</p>");
  } else {
    parts.push("<ul>");
    for (const l of data.followUpsDue) {
      parts.push(
        `<li>${escapeHtml(l.businessName)} — due ${escapeHtml(l.dueAt)}</li>`
      );
    }
    parts.push("</ul>");
  }

  parts.push(`<h2>Recent replies (${data.recentReplies.length})</h2>`);
  if (data.recentReplies.length === 0) {
    parts.push("<p>No replies this week.</p>");
  } else {
    parts.push("<ul>");
    for (const l of data.recentReplies) {
      const sentimentNote = l.sentiment ? ` · ${escapeHtml(l.sentiment)}` : "";
      parts.push(`<li>${escapeHtml(l.businessName)}${sentimentNote}</li>`);
    }
    parts.push("</ul>");
  }

  parts.push(`<hr><p style="color:#999;font-size:12px">Total leads in pipeline: ${data.totalLeads}</p>`);

  return parts.join("\n");
}

export function buildWeeklyDigestText(data: DigestData): string {
  const lines: string[] = [
    `DWN Lead Engine — Weekly Digest`,
    `Week of ${data.weekOf} · Hi ${data.ownerName}`,
    ``,
    `HOT LEADS (${data.hotLeads.length})`,
    ...(data.hotLeads.length === 0
      ? ["  None this week."]
      : data.hotLeads.map((l) => `  - ${l.businessName} (${l.stage}${l.score != null ? `, score ${l.score}` : ""})`)),
    ``,
    `STUCK CONTACTS (${data.stuckContacts.length})`,
    ...(data.stuckContacts.length === 0
      ? ["  None."]
      : data.stuckContacts.map((l) => `  - ${l.businessName} (${l.daysSinceContact}d)`)),
    ``,
    `FOLLOW-UPS DUE (${data.followUpsDue.length})`,
    ...(data.followUpsDue.length === 0
      ? ["  None."]
      : data.followUpsDue.map((l) => `  - ${l.businessName} due ${l.dueAt}`)),
    ``,
    `RECENT REPLIES (${data.recentReplies.length})`,
    ...(data.recentReplies.length === 0
      ? ["  None."]
      : data.recentReplies.map((l) => `  - ${l.businessName}${l.sentiment ? ` (${l.sentiment})` : ""}`)),
    ``,
    `Total leads: ${data.totalLeads}`,
  ];
  return lines.join("\n");
}
