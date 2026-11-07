import { describe, expect, it } from "vitest";
import { mapMatrixDistances } from "../lib/server/routes";

describe("mapMatrixDistances", () => {
  it("maps out-of-order route matrix elements to their destination areas", () => {
    const distances = mapMatrixDistances(["BTM Layout", "Whitefield"], [
      { destinationIndex: 1, distanceMeters: 18_200, condition: "ROUTE_EXISTS" },
      { destinationIndex: 0, distanceMeters: 4_500, condition: "ROUTE_EXISTS" },
    ]);

    expect(distances.get("btm layout")).toBe(4.5);
    expect(distances.get("whitefield")).toBeCloseTo(18.2);
  });

  it("keeps destinations without a route as null", () => {
    const distances = mapMatrixDistances(["BTM Layout", "Whitefield"], [
      { destinationIndex: 0, distanceMeters: 4_500, condition: "ROUTE_EXISTS" },
      { destinationIndex: 1, condition: "ROUTE_NOT_FOUND" },
    ]);

    expect(distances.get("btm layout")).toBe(4.5);
    expect(distances.get("whitefield")).toBeNull();
  });
});
