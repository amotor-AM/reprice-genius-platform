import { api, APIError } from "encore.dev/api";
import { getAuthData } from "~encore/auth";
import { listingsDB } from "./db";

export interface UpdateInventoryRequest {
  productId: string;
  quantityChange: number;
  locationId?: string;
  reason: string;
}

// Updates inventory for a product.
export const updateInventory = api<UpdateInventoryRequest, { newQuantity: number }>(
  { auth: true, expose: true, method: "POST", path: "/inventory/update" },
  async (req) => {
    const auth = getAuthData()!;

    // In a real implementation, this would be a transactional update
    const result = await listingsDB.queryRow`
      UPDATE inventory
      SET quantity = quantity + ${req.quantityChange},
          available_quantity = available_quantity + ${req.quantityChange}
      WHERE product_id = ${req.productId}
      RETURNING available_quantity
    `;

    if (!result) {
      // If no inventory record exists, create one
      const newRecord = await listingsDB.queryRow`
        INSERT INTO inventory (product_id, quantity, available_quantity)
        VALUES (${req.productId}, ${req.quantityChange}, ${req.quantityChange})
        RETURNING available_quantity
      `;
      return { newQuantity: newRecord.available_quantity };
    }

    return { newQuantity: result.available_quantity };
  }
);
