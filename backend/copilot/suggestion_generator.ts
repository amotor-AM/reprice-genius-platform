import { cron } from "encore.dev/cron";
import { copilotDB } from "./db";
import { userDB } from "../user/db";
import { analytics } from "~encore/clients";

// Generates proactive suggestions for users.
export const generateSuggestions = cron("generate-suggestions", {
  every: "6h",
  handler: async () => {
    const users = await userDB.queryAll`SELECT id FROM users`;

    for (const user of users) {
      try {
        // Get user's analytics data
        const dashboard = await analytics.getDashboard({ period: '30d' });

        // Generate suggestions based on data
        if (dashboard.totalListings > 10 && dashboard.priceChanges < 5) {
          await createSuggestion(user.id, {
            type: 'engagement',
            title: 'Increase Pricing Activity',
            description: 'You have many listings but few price changes. Consider using AI repricing to stay competitive.',
            command: { tool_name: 'reprice_all', parameters: { categoryId: 'all' } },
          });
        }

        if (dashboard.topPerformingListings.length > 0) {
          const topListing = dashboard.topPerformingListings[0];
          await createSuggestion(user.id, {
            type: 'optimization',
            title: `Optimize "${topListing.title}"`,
            description: `Your top performing listing has high revenue. Consider a slight price increase to maximize profit.`,
            command: { tool_name: 'update_price', parameters: { listingId: topListing.id, newPrice: topListing.revenue * 1.05 } },
          });
        }

      } catch (error) {
        console.error(`Failed to generate suggestions for user ${user.id}:`, error);
      }
    }
  },
});

async function createSuggestion(userId: string, suggestion: any) {
  await copilotDB.exec`
    INSERT INTO proactive_suggestions (user_id, suggestion_type, title, description, command_payload, confidence)
    VALUES (${userId}, ${suggestion.type}, ${suggestion.title}, ${suggestion.description}, ${JSON.stringify(suggestion.command)}, 0.85)
    ON CONFLICT (user_id, suggestion_type, title) DO NOTHING
  `;
}
