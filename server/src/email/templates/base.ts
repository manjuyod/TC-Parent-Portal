export function wrapHtml(content: string) {
  return `
  <div style="font-family:system-ui,Segoe UI,Roboto,Arial,sans-serif;line-height:1.5;">
    ${content}
    <hr style="margin-top:24px;border:none;border-top:1px solid #eee"/>
    <div style="color:#777;font-size:12px">This message was sent by Tutoring Club Parent Portal.</div>
  </div>`;
}

export function toText(html: string) {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}