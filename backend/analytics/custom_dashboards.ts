import { api, APIError } from "encore.dev/api";
import { getAuthData } from "~encore/auth";
import { analyticsDB } from "./db";
import { v4 as uuidv4 } from 'uuid';

export interface DashboardView {
  id: string;
  name: string;
  isDefault: boolean;
  configuration: any;
}

export interface CreateDashboardViewRequest {
  name: string;
  configuration: any;
  isDefault?: boolean;
}

// Creates a new customizable dashboard view.
export const createDashboardView = api<CreateDashboardViewRequest, { viewId: string }>(
  { auth: true, expose: true, method: "POST", path: "/analytics/dashboards/views" },
  async (req) => {
    const auth = getAuthData()!;
    const viewId = uuidv4();

    await analyticsDB.exec`
      INSERT INTO dashboard_views (id, user_id, name, configuration, is_default)
      VALUES (${viewId}, ${auth.userID}, ${req.name}, ${JSON.stringify(req.configuration)}, ${req.isDefault || false})
    `;

    return { viewId };
  }
);

// Gets all saved dashboard views for the user.
export const getDashboardViews = api<void, { views: DashboardView[] }>(
  { auth: true, expose: true, method: "GET", path: "/analytics/dashboards/views" },
  async () => {
    const auth = getAuthData()!;
    const views = await analyticsDB.queryAll`
      SELECT id, name, is_default, configuration FROM dashboard_views
      WHERE user_id = ${auth.userID}
      ORDER BY name
    `;
    return { views };
  }
);

// Updates a dashboard view.
export const updateDashboardView = api<{ viewId: string } & Partial<CreateDashboardViewRequest>, { success: boolean }>(
  { auth: true, expose: true, method: "PUT", path: "/analytics/dashboards/views/:viewId" },
  async (req) => {
    const auth = getAuthData()!;
    
    const result = await analyticsDB.exec`
      UPDATE dashboard_views SET
        name = COALESCE(${req.name}, name),
        configuration = COALESCE(${req.configuration ? JSON.stringify(req.configuration) : null}, configuration),
        is_default = COALESCE(${req.isDefault}, is_default),
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ${req.viewId} AND user_id = ${auth.userID}
    `;

    return { success: true };
  }
);

// Deletes a dashboard view.
export const deleteDashboardView = api<{ viewId: string }, { success: boolean }>(
  { auth: true, expose: true, method: "DELETE", path: "/analytics/dashboards/views/:viewId" },
  async (req) => {
    const auth = getAuthData()!;
    await analyticsDB.exec`
      DELETE FROM dashboard_views WHERE id = ${req.viewId} AND user_id = ${auth.userID}
    `;
    return { success: true };
  }
);
