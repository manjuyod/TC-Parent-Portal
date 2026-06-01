import { describe, expect, it } from "vitest";

import { shouldShowInRecentSessions } from "../../client/src/lib/sessionFilters";

describe("shouldShowInRecentSessions", () => {
  it("hides excused absences from the recent sessions card", () => {
    expect(shouldShowInRecentSessions({ Attendance: "Absent (excused)" })).toBe(false);
    expect(shouldShowInRecentSessions({ Attendance: "  Absent (excused)  " })).toBe(false);
  });

  it("keeps other attendance states and sessions without attendance", () => {
    expect(shouldShowInRecentSessions({ Attendance: "Present (on time)" })).toBe(true);
    expect(shouldShowInRecentSessions({ Attendance: "Present (came late)" })).toBe(true);
    expect(shouldShowInRecentSessions({ Attendance: "Absent (no notice)" })).toBe(true);
    expect(shouldShowInRecentSessions({ Attendance: null })).toBe(true);
    expect(shouldShowInRecentSessions({})).toBe(true);
  });
});
