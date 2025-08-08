import { secret } from "encore.dev/config";

const googleVisionApiKey = secret("GoogleVisionApiKey");

export interface ImageAnalysis {
  qualityScore: number; // 0-1, overall quality
  conditionScore: number; // 0-1, detected condition
  appealScore: number; // 0-1, visual appeal
  detectedObjects: string[];
  dominantColors: string[];
  embedding: number[]; // Image embedding vector
}

export async function analyzeImageWithViT(imageUrl: string): Promise<ImageAnalysis> {
  if (!imageUrl) {
    return {
      qualityScore: 0.3,
      conditionScore: 0.5,
      appealScore: 0.3,
      detectedObjects: [],
      dominantColors: [],
      embedding: Array.from({ length: 128 }, () => 0),
    };
  }

  try {
    const response = await fetch(`https://vision.googleapis.com/v1/images:annotate?key=${googleVisionApiKey()}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        requests: [{
          image: { source: { imageUri: imageUrl } },
          features: [
            { type: 'LABEL_DETECTION', maxResults: 10 },
            { type: 'IMAGE_PROPERTIES' },
            { type: 'SAFE_SEARCH_DETECTION' },
          ],
        }],
      }),
    });

    if (!response.ok) {
      throw new Error(`Google Vision API error: ${response.statusText}`);
    }

    const data = await response.json();
    const annotation = data.responses[0];

    const qualityScore = annotation.imagePropertiesAnnotation?.dominantColors?.colors
      .reduce((sum: number, color: any) => sum + color.score, 0) / 10 || 0.7;
    
    const appealScore = annotation.safeSearchAnnotation?.adult === 'VERY_UNLIKELY' ? 0.8 : 0.2;

    return {
      qualityScore,
      conditionScore: 0.8, // Hard to determine without a custom model
      appealScore,
      detectedObjects: annotation.labelAnnotations?.map((label: any) => label.description) || [],
      dominantColors: annotation.imagePropertiesAnnotation?.dominantColors?.colors
        .map((c: any) => `rgb(${c.color.red}, ${c.color.green}, ${c.color.blue})`) || [],
      embedding: Array.from({ length: 128 }, () => Math.random()), // Placeholder for real embedding
    };
  } catch (error) {
    console.error("Error analyzing image with Google Vision:", error);
    // Return a default on error
    return {
      qualityScore: 0.5,
      conditionScore: 0.5,
      appealScore: 0.5,
      detectedObjects: [],
      dominantColors: [],
      embedding: Array.from({ length: 128 }, () => 0),
    };
  }
}
