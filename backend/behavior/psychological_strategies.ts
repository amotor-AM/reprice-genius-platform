import { api, APIError } from "encore.dev/api";
import { getAuthData } from "~encore/auth";
import { behaviorDB } from "./db";
import { listingsDB } from "../listings/db";
import { calculateCharmPrice, getPriceAnchorEffect } from "./models/behavioral_economics";

export interface PsychologicalStrategyRequest {
  listingId: string;
  strategyType: 'charm_pricing' | 'bundling' | 'loss_leader' | 'reference_pricing';
}

export interface PsychologicalStrategyResponse {
  listingId: string;
  strategyType: string;
  recommendedAction: {
    newPrice?: number;
    bundleWith?: string[];
    reasoning: string;
  };
  expectedImpact: {
    conversionLift: number;
    perceivedValueIncrease: number;
  };
  confidence: number;
}

// Gets a psychological pricing strategy recommendation.
export const getPsychologicalStrategy = api<PsychologicalStrategyRequest, PsychologicalStrategyResponse>(
  { auth: true, expose: true, method: "POST", path: "/behavior/strategy/psychological" },
  async (req) => {
    const auth = getAuthData()!;
    const listing = await listingsDB.queryRow`
      SELECT p.*, ml.current_price, ml.original_price FROM products p
      JOIN marketplace_listings ml ON p.id = ml.product_id
      WHERE p.id = ${req.listingId} AND p.user_id = ${auth.userID}
    `;
    if (!listing) throw APIError.notFound("Listing not found");

    let response: PsychologicalStrategyResponse;

    switch (req.strategyType) {
      case 'charm_pricing':
        response = getCharmPricingStrategy(listing);
        break;
      case 'reference_pricing':
        response = getReferencePricingStrategy(listing);
        break;
      // Other cases would be implemented here
      default:
        throw APIError.invalidArgument("Unsupported strategy type");
    }

    return response;
  }
);

function getCharmPricingStrategy(listing: any): PsychologicalStrategyResponse {
  const newPrice = calculateCharmPrice(listing.current_price);
  const conversionLift = newPrice < listing.current_price ? 0.05 : 0; // 5% lift if price is lowered

  return {
    listingId: listing.id,
    strategyType: 'charm_pricing',
    recommendedAction: {
      newPrice,
      reasoning: `Adjusting price to end in .99 can increase perceived value and conversion.`,
    },
    expectedImpact: {
      conversionLift,
      perceivedValueIncrease: 0.03,
    },
    confidence: 0.75,
  };
}

function getReferencePricingStrategy(listing: any): PsychologicalStrategyResponse {
  const referencePrice = listing.original_price > listing.current_price 
    ? listing.original_price 
    : listing.current_price * 1.25; // Suggest a 25% higher reference price

  const perceivedValueIncrease = getPriceAnchorEffect(listing.current_price, referencePrice);

  return {
    listingId: listing.id,
    strategyType: 'reference_pricing',
    recommendedAction: {
      reasoning: `Establishing a higher reference price of $${referencePrice.toFixed(2)} makes the current price of $${listing.current_price.toFixed(2)} seem like a better deal.`,
    },
    expectedImpact: {
      conversionLift: perceivedValueIncrease * 0.1, // 10% of value increase converts
      perceivedValueIncrease,
    },
    confidence: 0.8,
  };
}
