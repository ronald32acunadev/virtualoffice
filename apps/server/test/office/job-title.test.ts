import { afterEach, describe, expect, it } from "vitest";
import { createHarness } from "../helpers/harness.ts";
import { buildApp } from "../../src/http/app.ts";

describe("jobTitle", () => {
  let h = createHarness();
  let app: Awaited<ReturnType<typeof buildApp>>;

  afterEach(async () => {
    if (app) {
      await app.close();
    }
    h = createHarness();
  });

  it("trims and persists jobTitle", async () => {
    const employee = h.office.hire({
      bossId: "claude",
      task: "Build feature",
      workingDirectory: h.dir,
      jobTitle: "  Frontend Engineer  ",
    });

    const state = h.office.getState();
    const found = state.employees.find((e) => e.id === employee.id);
    expect(found?.jobTitle).toBe("Frontend Engineer");
    expect(h.emitted).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "employee_updated",
          employee: expect.objectContaining({ jobTitle: "Frontend Engineer" }),
        }),
      ]),
    );
  });

  it("stores null when jobTitle is omitted", async () => {
    const employee = h.office.hire({
      bossId: "claude",
      task: "Build feature",
      workingDirectory: h.dir,
    });

    const state = h.office.getState();
    const found = state.employees.find((e) => e.id === employee.id);
    expect(found?.jobTitle).toBeNull();
  });

  it("updates jobTitle via updateProfile", async () => {
    const employee = h.office.hire({
      bossId: "claude",
      task: "Build feature",
      workingDirectory: h.dir,
    });

    const updated = h.office.updateProfile(employee.id, { jobTitle: "Architect" });
    const state = h.office.getState();
    const found = state.employees.find((e) => e.id === employee.id);
    expect(found?.jobTitle).toBe("Architect");
  });

  it("clears jobTitle to null via updateProfile", async () => {
    const employee = h.office.hire({
      bossId: "claude",
      task: "Build feature",
      workingDirectory: h.dir,
      jobTitle: "Architect",
    });

    h.office.updateProfile(employee.id, { jobTitle: "   " });
    h.office.updateProfile(employee.id, { jobTitle: null });

    const state = h.office.getState();
    const found = state.employees.find((e) => e.id === employee.id);
    expect(found?.jobTitle).toBeNull();
  });

  it("throws OfficeError for 61 char jobTitle", () => {
    const longTitle = "a".repeat(61);
    expect(() =>
      h.office.hire({
        bossId: "claude",
        task: "Build feature",
        workingDirectory: h.dir,
        jobTitle: longTitle,
      }),
    ).toThrow(expect.objectContaining({ code: "validation_error", field: "jobTitle" }));

    const employee = h.office.hire({
      bossId: "claude",
      task: "Build feature",
      workingDirectory: h.dir,
      jobTitle: "Architect",
    });

    expect(() =>
      h.office.updateProfile(employee.id, { jobTitle: longTitle }),
    ).toThrow(expect.objectContaining({ code: "validation_error", field: "jobTitle" }));
    expect(h.repository.getEmployee(employee.id)?.jobTitle).toBe("Architect");
  });

  it("coexists with role", async () => {
    const employee = h.office.hire({
      bossId: "claude",
      task: "Build feature",
      workingDirectory: h.dir,
      jobTitle: "Senior Engineer",
      role: "Senior",
    });

    expect(employee.jobTitle).toBe("Senior Engineer");
    expect(employee.role).toBe("Senior");

    h.office.updateProfile(employee.id, { jobTitle: "Lead Engineer" });

    const state = h.office.getState();
    const found = state.employees.find((e) => e.id === employee.id);
    expect(found?.jobTitle).toBe("Lead Engineer");
    expect(found?.role).toBe("Senior");
  });

  it("HTTP endpoints handle jobTitle", async () => {
    app = await buildApp({
      token: "test-token",
      port: 4321,
      repository: h.repository,
      office: h.office,
    });

    const res = await app.inject({
      method: "POST",
      url: "/api/employees",
      payload: {
        bossId: "claude",
        task: "Build feature",
        workingDirectory: h.dir,
        jobTitle: "  QA Engineer  ",
      },
      headers: { host: "127.0.0.1:4321", authorization: "Bearer test-token" },
    });

    expect(res.statusCode).toBe(201);
    const created = res.json().employee;
    expect(created.jobTitle).toBe("QA Engineer");

    const resUpdate = await app.inject({
      method: "PATCH",
      url: `/api/employees/${created.id}`,
      payload: { jobTitle: "Product Manager" },
      headers: { host: "127.0.0.1:4321", authorization: "Bearer test-token" },
    });

    expect(resUpdate.statusCode).toBe(200);
    const updated = resUpdate.json().employee;
    expect(updated.jobTitle).toBe("Product Manager");

    const resLong = await app.inject({
      method: "PATCH",
      url: `/api/employees/${created.id}`,
      payload: { jobTitle: "a".repeat(61) },
      headers: { host: "127.0.0.1:4321", authorization: "Bearer test-token" },
    });

    expect(resLong.statusCode).toBe(400);
    const state = h.office.getState();
    const found = state.employees.find((e) => e.id === created.id);
    expect(found?.jobTitle).toBe("Product Manager");
  });
});
