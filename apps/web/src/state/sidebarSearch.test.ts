import { describe, expect, it } from "vitest";
import type { Employee } from "../api/types";
import { filterEmployees, groupEmployeesByProject } from "./sidebar";

describe("sidebarSearch", () => {
  const employeeFixture: Employee = {
    id: "1",
    bossId: "claude",
    hiredBy: "3",
    task: "fix bug",
    workingDirectory: "/home/dev/virtualoffice",
    name: "Alice",
    species: "human",
    importedAt: "2024-01-01T00:00:00Z",
    role: "developer",
    jobTitle: "Senior Engineer",
    providerSessionId: "session123",
    status: "idle",
    failureReason: null,
    createdAt: "2024-01-01T00:00:00Z",
    updatedAt: "2024-01-01T00:00:00Z",
  };

  describe("filterEmployees", () => {
    it("returns all employees for empty or whitespace query", () => {
      const employees = [employeeFixture];
      const result = filterEmployees(employees, "");
      expect(result).toHaveLength(1);
      expect(result[0]).toEqual(employeeFixture);
    });

    it("matches case-insensitively on name, jobTitle, task, workingDirectory, and role", () => {
      const employees = [employeeFixture];
      const result = filterEmployees(employees, "senior engineer");
      expect(result).toHaveLength(1);
      expect(result[0]).toEqual(employeeFixture);
    });

    it("returns empty array for non-matching query", () => {
      const employees = [employeeFixture];
      const result = filterEmployees(employees, "nonexistent");
      expect(result).toHaveLength(0);
    });
  });

  describe("groupEmployeesByProject", () => {
    it("groups employees by normalized workingDirectory and derives projectName", () => {
      const employees: Employee[] = [
        {
          ...employeeFixture,
          id: "1",
          workingDirectory: "/home/dev/virtualoffice",
          updatedAt: "2024-01-01T00:00:00Z",
        },
        {
          ...employeeFixture,
          id: "2",
          workingDirectory: "/home/dev/virtualoffice",
          updatedAt: "2024-01-02T00:00:00Z",
        },
        {
          ...employeeFixture,
          id: "3",
          workingDirectory: "/home/dev/ardi/",
          updatedAt: "2024-01-03T00:00:00Z",
        },
      ];

      const result = groupEmployeesByProject(employees);

      expect(result).toHaveLength(2);
      expect(result[0]?.projectName).toBe("ardi");
      expect(result[1]?.projectName).toBe("virtualoffice");
    });

    it("orders employees within each project by newest updatedAt first", () => {
      const employees: Employee[] = [
        {
          ...employeeFixture,
          id: "1",
          workingDirectory: "/home/dev/virtualoffice",
          updatedAt: "2024-01-01T00:00:00Z",
        },
        {
          ...employeeFixture,
          id: "2",
          workingDirectory: "/home/dev/virtualoffice",
          updatedAt: "2024-01-03T00:00:00Z",
        },
        {
          ...employeeFixture,
          id: "3",
          workingDirectory: "/home/dev/virtualoffice",
          updatedAt: "2024-01-02T00:00:00Z",
        },
      ];

      const result = groupEmployeesByProject(employees);

      expect(result[0]?.employees).toHaveLength(3);
      expect(result[0]?.employees[0]?.id).toBe("2");
      expect(result[0]?.employees[1]?.id).toBe("3");
      expect(result[0]?.employees[2]?.id).toBe("1");
    });

    it("orders project groups by their most recently updated employee first", () => {
      const employees: Employee[] = [
        {
          ...employeeFixture,
          id: "1",
          workingDirectory: "/home/dev/virtualoffice",
          updatedAt: "2024-01-01T00:00:00Z",
        },
        {
          ...employeeFixture,
          id: "2",
          workingDirectory: "/home/dev/ardi/",
          updatedAt: "2024-01-03T00:00:00Z",
        },
        {
          ...employeeFixture,
          id: "3",
          workingDirectory: "/home/dev/virtualoffice",
          updatedAt: "2024-01-02T00:00:00Z",
        },
      ];

      const result = groupEmployeesByProject(employees);

      expect(result[0]?.projectName).toBe("ardi");
      expect(result[1]?.projectName).toBe("virtualoffice");
      expect(result[0]?.employees[0]?.id).toBe("2");
      expect(result[1]?.employees[0]?.id).toBe("3");
    });
  });
});
