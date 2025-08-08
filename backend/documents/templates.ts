import { api, APIError } from "encore.dev/api";
import { getAuthData } from "~encore/auth";
import { documentsDB } from "./db";

export interface ExtractionTemplate {
  id: string;
  name: string;
  templateType: 'invoice' | 'purchase_order';
  fields: Array<{
    name: string;
    type: 'string' | 'number' | 'date';
    keywords: string[];
    position?: { x: number; y: number; width: number; height: number };
  }>;
  isDefault: boolean;
}

// Gets all extraction templates for the user.
export const getTemplates = api<void, { templates: ExtractionTemplate[] }>(
  { auth: true, expose: true, method: "GET", path: "/documents/templates" },
  async () => {
    const auth = getAuthData()!;

    const templates = await documentsDB.queryAll`
      SELECT id, name, template_type, fields, is_default 
      FROM extraction_templates 
      WHERE user_id = ${auth.userID} OR is_default = true
      ORDER BY name
    `;

    return {
      templates: templates.map(t => ({
        id: t.id,
        name: t.name,
        templateType: t.template_type,
        fields: t.fields,
        isDefault: t.is_default,
      })),
    };
  }
);

export interface CreateTemplateRequest {
  name: string;
  templateType: 'invoice' | 'purchase_order';
  fields: ExtractionTemplate['fields'];
}

// Creates a new extraction template.
export const createTemplate = api<CreateTemplateRequest, { templateId: string }>(
  { auth: true, expose: true, method: "POST", path: "/documents/templates" },
  async (req) => {
    const auth = getAuthData()!;
    const templateId = `tpl_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    await documentsDB.exec`
      INSERT INTO extraction_templates (id, user_id, name, template_type, fields)
      VALUES (${templateId}, ${auth.userID}, ${req.name}, ${req.templateType}, ${JSON.stringify(req.fields)})
    `;

    return { templateId };
  }
);
