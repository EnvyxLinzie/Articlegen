import { NextRequest, NextResponse } from 'next/server';
import { openRouterService } from '@/lib/ai/openrouter';
import dbConnect from '@/lib/db/mongodb';
import User from '@/lib/db/models/User';
import Article from '@/lib/db/models/Article';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/auth';

// Force dynamic rendering to avoid build-time errors
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// Simple in-memory rate limiting (in production, use Redis)
const rateLimitMap = new Map<string, { count: number; resetTime: number }>();

function checkRateLimit(userId: string, limit: number = 10, windowMs: number = 60000): boolean {
  const now = Date.now();
  const userLimit = rateLimitMap.get(userId);
  
  if (!userLimit || now > userLimit.resetTime) {
    rateLimitMap.set(userId, { count: 1, resetTime: now + windowMs });
    return true;
  }
  
  if (userLimit.count >= limit) {
    return false;
  }
  
  userLimit.count++;
  return true;
}

export async function POST(request: NextRequest) {
  try {
    // Connect to database
    await dbConnect();

    // Get session
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get user
    const user = await User.findOne({ email: session.user.email });
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Rate limiting: 10 requests per minute per user
    if (!checkRateLimit(user._id.toString(), 10, 60000)) {
      return NextResponse.json(
        { error: 'Rate limit exceeded. Please try again in 1 minute.' },
        { status: 429 }
      );
    }

    // Parse request body
    const body = await request.json();
    const {
      topic,
      category,
      tone = 'professional',
      language = 'English',
      wordCount = 500,
      keywords = [],
      additionalInstructions = '',
    } = body;

    // Validate required fields
    if (!topic || !category) {
      return NextResponse.json(
        { error: 'Topic and category are required' },
        { status: 400 }
      );
    }

    // Validate input length
    if (topic.length > 200) {
      return NextResponse.json(
        { error: 'Topic is too long (max 200 characters)' },
        { status: 400 }
      );
    }

    if (additionalInstructions.length > 1000) {
      return NextResponse.json(
        { error: 'Additional instructions are too long (max 1000 characters)' },
        { status: 400 }
      );
    }

    // Validate word count
    if (wordCount < 100 || wordCount > 2000) {
      return NextResponse.json(
        { error: 'Word count must be between 100 and 2000' },
        { status: 400 }
      );
    }

    // Generate article using OpenRouter AI
    const generatedArticle = await openRouterService.generateArticle({
      topic,
      category,
      tone,
      language,
      wordCount,
      keywords,
      additionalInstructions,
    });

    // Generate SEO metadata
    const seoMetadata = await openRouterService.generateSeoMetadata(
      generatedArticle.title,
      generatedArticle.content
    );

    // Create article in database
    const article = new Article({
      title: generatedArticle.title,
      content: generatedArticle.content,
      summary: generatedArticle.summary,
      keywords: generatedArticle.keywords,
      category,
      tone,
      language,
      wordCount: generatedArticle.content.split(/\s+/).length,
      author: user._id,
      tags: keywords,
      seoTitle: seoMetadata.seoTitle,
      seoDescription: seoMetadata.seoDescription,
      status: 'draft',
    });

    await article.save();

    // Update user's article count
    user.articlesGenerated += 1;
    await user.save();

    return NextResponse.json({
      success: true,
      article: {
        id: article._id,
        title: article.title,
        content: article.content,
        summary: article.summary,
        keywords: article.keywords,
        category: article.category,
        tone: article.tone,
        language: article.language,
        wordCount: article.wordCount,
        readingTime: article.readingTime,
        seoTitle: article.seoTitle,
        seoDescription: article.seoDescription,
        status: article.status,
        createdAt: article.createdAt,
      },
      userStats: {
        articlesGenerated: user.articlesGenerated,
      },
    });
  } catch (error) {
    console.error('Error generating article:', error);
    return NextResponse.json(
      { 
        error: 'Failed to generate article',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
} 