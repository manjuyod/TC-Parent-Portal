import { beforeEach, describe, expect, it, vi } from "vitest";

const inputMock = vi.hoisted(() => vi.fn());
const queryMock = vi.hoisted(() => vi.fn());
const requestMock = vi.hoisted(() => vi.fn(() => ({ input: inputMock, query: queryMock })));
const getPoolMock = vi.hoisted(() => vi.fn(async () => ({ request: requestMock })));

vi.mock("../db", () => ({
  getPool: getPoolMock,
  sql: { Int: "Int" },
}));

import { getSessions } from "../sqlServerStorage";

describe("getSessions attendance data", () => {
  beforeEach(() => {
    inputMock.mockClear();
    queryMock.mockReset();
    requestMock.mockClear();
    getPoolMock.mockClear();

    queryMock.mockImplementation(async (sqlText: string) => {
      if (sqlText.includes("FROM dpinkney_TC.dbo.tblSessionSchedule AS s")) {
        return {
          recordset: [
            {
              StudentID: 39055,
              ScheduleDateISO: "2026-05-01",
              DayRaw: "Friday",
              TimeID: 101,
              Attendance: "Absent (excused)",
            },
          ],
        };
      }

      if (sqlText.includes("FROM dpinkney_TC.dbo.tblTimes")) {
        return { recordset: [{ HHMMSS: "16:30:00" }] };
      }

      return { recordset: [] };
    });
  });

  it("selects attendance with a left join and returns it without filtering rows", async () => {
    const sessions = await getSessions(39055);

    const sessionQuery = String(queryMock.mock.calls[0]?.[0] || "");
    expect(sessionQuery).toContain("a.Attendance AS Attendance");
    expect(sessionQuery).toContain("LEFT JOIN dpinkney_TC.dbo.tblAttendance AS a");
    expect(sessionQuery).toContain("ON s.ID = a.MSID");
    expect(sessionQuery).toContain("WHERE s.StudentId1 = @sid");
    expect(sessionQuery).not.toContain("a.Attendance !=");
    expect(sessionQuery).not.toContain("Absent (excused)");

    expect(sessions[0]).toMatchObject({
      StudentID: 39055,
      ScheduleDateISO: "2026-05-01",
      Attendance: "Absent (excused)",
    });
  });
});
