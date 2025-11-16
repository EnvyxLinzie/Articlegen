export interface OpenRouterMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface OpenRouterResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: {
      role: string;
      content: string;
    };
    finish_reason: string;
  }>;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

export interface ArticleGenerationParams {
  topic: string;
  category: string;
  tone: 'professional' | 'casual' | 'friendly' | 'formal';
  language: string;
  wordCount: number;
  keywords?: string[];
  additionalInstructions?: string;
}

function tryParseJsonString(str: string) {
  // Try to find the first and last curly braces and parse that substring
  const first = str.indexOf('{');
  const last = str.lastIndexOf('}');
  if (first !== -1 && last !== -1 && last > first) {
    try {
      return JSON.parse(str.slice(first, last + 1));
    } catch {}
  }
  return null;
}

function cleanContent(str: string) {
  // Remove leading/trailing code block markers and escape characters
  return str
    .replace(/^```json[\r\n]*/i, '')
    .replace(/^```[\r\n]*/i, '')
    .replace(/```$/g, '')
    .replace(/\\n/g, '\n')
    .replace(/\n/g, '\n')
    .replace(/\\"/g, '"')
    .trim();
}

class OpenRouterService {
  private apiKey: string;
  private siteUrl: string;
  private siteName: string;
  private defaultModel: string;
  private baseUrl = 'https://openrouter.ai/api/v1/chat/completions';

  constructor() {
    this.apiKey = process.env.OPENROUTER_API_KEY!;
    this.siteUrl = process.env.OPENROUTER_SITE_URL!;
    this.siteName = process.env.OPENROUTER_SITE_NAME!;
    // Default model bisa diubah via environment variable
    // Daftar model: https://openrouter.ai/models
    this.defaultModel = process.env.OPENROUTER_MODEL || 'deepseek/deepseek-chat-v3-0324:free';

    if (!this.apiKey) {
      throw new Error('OPENROUTER_API_KEY is required');
    }
  }

  private async makeRequest(messages: OpenRouterMessage[], model?: string): Promise<OpenRouterResponse> {
    const modelToUse = model || this.defaultModel;
    const response = await fetch(this.baseUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'HTTP-Referer': this.siteUrl,
        'X-Title': this.siteName,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: modelToUse,
        messages,
        temperature: 0.7,
        max_tokens: 4000,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`OpenRouter API error: ${response.status} - ${error}`);
    }

    return response.json();
  }

  async generateArticle(params: ArticleGenerationParams): Promise<{
    title: string;
    content: string;
    summary: string;
    keywords: string[];
  }> {
    const systemPrompt = `You are an expert content writer, SEO specialist, and storyteller. Write as if you are a professional human writer for a top-tier publication. Your writing should:
- Be engaging, natural, and easy to read (avoid robotic or repetitive phrasing)
- Use storytelling, examples, and a conversational tone where appropriate
- Use varied sentence structure and vocabulary (avoid generic AI patterns)
- Be SEO-optimized (use headings, subheadings, and integrate keywords naturally)
- Include a compelling introduction and a strong conclusion
- Add value, insight, and a human touch (not just facts)
- Avoid plagiarism and always write in your own words
- Use markdown for headings, subheadings, and lists

Your task is to create an article based on the following requirements:
- Topic: ${params.topic}
- Category: ${params.category}
- Tone: ${params.tone}
- Language: ${params.language}
- Target word count: ${params.wordCount}
- Keywords: ${params.keywords?.join(', ') || 'N/A'}
${params.additionalInstructions ? `- Additional instructions: ${params.additionalInstructions}` : ''}

Please structure your response as a JSON object with the following format:
{
  "title": "SEO-optimized title",
  "content": "Full article content with markdown formatting, headings, and paragraphs",
  "summary": "Brief summary of the article (2-3 sentences)",
  "keywords": ["keyword1", "keyword2", "keyword3"]
}

Make sure the content is:
- Well-researched and informative
- Engaging and easy to read
- SEO-optimized with proper heading structure
- Free of plagiarism
- Tailored to the specified tone and language
- Approximately ${params.wordCount} words`;

    const userPrompt = `Please generate an article about "${params.topic}" in the ${params.category} category.`;

    const messages: OpenRouterMessage[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ];

    try {
      const response = await this.makeRequest(messages);
      let content = response.choices[0]?.message?.content;
      if (!content) {
        throw new Error('No content received from AI');
      }
      content = cleanContent(content);
      // Try to parse as JSON
      let parsed: Record<string, unknown> | null = null;
      try {
        parsed = JSON.parse(content);
      } catch {
        parsed = tryParseJsonString(content);
      }
      if (
        parsed &&
        typeof parsed.title === 'string' &&
        typeof parsed.content === 'string' &&
        typeof parsed.summary === 'string'
      ) {
        return {
          title: parsed.title,
          content: parsed.content.replace(/\\n/g, '\n'),
          summary: parsed.summary,
          keywords: Array.isArray(parsed.keywords) ? parsed.keywords : [],
        };
      }
      // Fallback: extract content manually
      // Try to find lines like Title: ...
      const lines = content.split('\n');
      const title = lines.find(line => /title:/i.test(line))?.replace(/.*[Tt]itle:\s*/, '') || params.topic;
      const summary = lines.find(line => /summary:/i.test(line))?.replace(/.*[Ss]ummary:\s*/, '') || `Article about ${params.topic}`;
      const keywords = params.keywords || [];
      // Remove any leading/trailing code block or json
      return {
        title,
        content: content,
        summary,
        keywords,
      };
    } catch (error) {
      console.error('Error generating article:', error);
      throw new Error(`Failed to generate article: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async improveArticle(content: string, instructions: string): Promise<string> {
    const systemPrompt = `You are an expert content editor. Improve the provided article based on the given instructions while maintaining the original meaning and structure.`;

    const userPrompt = `Please improve this article based on the following instructions:

Instructions: ${instructions}

Article:
${content}

Please return only the improved article content without any additional formatting or explanations.`;

    const messages: OpenRouterMessage[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ];

    try {
      const response = await this.makeRequest(messages);
      return response.choices[0]?.message?.content || content;
    } catch (error) {
      console.error('Error improving article:', error);
      throw new Error(`Failed to improve article: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async generateSeoMetadata(title: string, content: string): Promise<{
    seoTitle: string;
    seoDescription: string;
  }> {
    const systemPrompt = `You are an SEO specialist. Generate SEO-optimized title and meta description for the given article.`;

    const userPrompt = `Please generate SEO metadata for this article:

Title: ${title}
Content: ${content.substring(0, 500)}...

Please return a JSON object with:
{
  "seoTitle": "SEO-optimized title (max 60 characters)",
  "seoDescription": "Meta description (max 160 characters)"
}`;

    const messages: OpenRouterMessage[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ];

    try {
      const response = await this.makeRequest(messages);
      let content = response.choices[0]?.message?.content;
      if (!content) {
        throw new Error('No content received from AI');
      }
      content = cleanContent(content);
      let parsed: Record<string, unknown> | null = null;
      try {
        parsed = JSON.parse(content);
      } catch {
        parsed = tryParseJsonString(content);
      }
      if (
        parsed &&
        typeof parsed.seoTitle === 'string' &&
        typeof parsed.seoDescription === 'string'
      ) {
        return {
          seoTitle: parsed.seoTitle,
          seoDescription: parsed.seoDescription,
        };
      }
      return {
        seoTitle: title,
        seoDescription: content.substring(0, 160),
      };
    } catch (error) {
      console.error('Error generating SEO metadata:', error);
      return {
        seoTitle: title,
        seoDescription: '',
      };
    }
  }
}

// Lazy initialization to avoid errors during build time
let openRouterServiceInstance: OpenRouterService | null = null;

export const openRouterService = {
  get instance(): OpenRouterService {
    if (!openRouterServiceInstance) {
      openRouterServiceInstance = new OpenRouterService();
    }
    return openRouterServiceInstance;
  },
  generateArticle: (params: ArticleGenerationParams) => {
    return openRouterService.instance.generateArticle(params);
  },
  improveArticle: (content: string, instructions: string) => {
    return openRouterService.instance.improveArticle(content, instructions);
  },
  generateSeoMetadata: (title: string, content: string) => {
    return openRouterService.instance.generateSeoMetadata(title, content);
  },
}; 