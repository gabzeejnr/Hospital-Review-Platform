import express from "express";
import { listStates, listLgas } from "../../controllers/location.controller.js";
import { validate } from "../middleware/validate.js";
import { stateParams } from "../validation/hospital.schemas.js";

const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: Locations
 *   description: States and local government areas (LGAs), for the search filters
 */

/**
 * @swagger
 * /api/states:
 *   get:
 *     summary: List all states with their hospital counts
 *     tags: [Locations]
 *     responses:
 *       200:
 *         description: States retrieved successfully
 */
router.get("/", listStates);

/**
 * @swagger
 * /api/states/{stateId}/lgas:
 *   get:
 *     summary: List the LGAs of a state
 *     tags: [Locations]
 *     parameters:
 *       - in: path
 *         name: stateId
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: LGAs retrieved successfully
 *       400:
 *         description: Invalid state ID
 *       404:
 *         description: State not found
 */
router.get("/:stateId/lgas", validate({ params: stateParams }), listLgas);

export default router;