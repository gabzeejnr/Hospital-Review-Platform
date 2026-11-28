import prisma from "../src/config/prisma.js";
import { ApiError } from "../src/utils/ApiError.js";

// Reference data for the search filters: states and their LGAs.
// Public and rarely changes, so it may be cached for an hour.

const setCache = (res) => res.set("Cache-Control", "public, max-age=3600");

// GET /api/states
export const listStates = async (req, res) => {
  const states = await prisma.states.findMany({
    orderBy: { name: "asc" },
    select: { id: true, name: true, _count: { select: { hospitals: true } } },
  });

  setCache(res);

  return res.status(200).json({
    success: true,
    states: states.map((state) => ({
      id: state.id,
      name: state.name,
      hospitalCount: state._count.hospitals,
    })),
  });
};

// GET /api/states/:stateId/lgas
export const listLgas = async (req, res) => {
  const { stateId } = req.params;

  const state = await prisma.states.findUnique({
    where: { id: stateId },
    select: { id: true, name: true },
  });

  if (!state) {
    throw new ApiError(404, "State not found", { code: "STATE_NOT_FOUND" });
  }

  const lgas = await prisma.lgas.findMany({
    where: { state_id: stateId },
    orderBy: { name: "asc" },
    select: { id: true, name: true, _count: { select: { hospitals: true } } },
  });

  setCache(res);

  return res.status(200).json({
    success: true,
    state,
    lgas: lgas.map((lga) => ({
      id: lga.id,
      name: lga.name,
      hospitalCount: lga._count.hospitals,
    })),
  });
};