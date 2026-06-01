export type AttendanceSession = {
  Attendance?: string | null;
};

export function shouldShowInRecentSessions(session: AttendanceSession): boolean {
  return String(session.Attendance ?? "").trim() !== "Absent (excused)";
}
