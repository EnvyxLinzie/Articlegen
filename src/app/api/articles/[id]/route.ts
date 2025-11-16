import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/db/mongodb';
import Article from '@/lib/db/models/Article';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/auth';
import { openRouterService } from '@/lib/ai/openrouter';

// Force dynamic rendering to avoid build-time errors
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// Simple in-memory rate limiting (per user)
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

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    await dbConnect();
    const article = await Article.findById(id).populate('author').lean();
    if (!article) {
      return NextResponse.json({ error: 'Article not found' }, { status: 404 });
    }
    return NextResponse.json({ success: true, article });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to fetch article', details: error instanceof Error ? error.message : 'Unknown error' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: _id } = await params;
  try {
    await dbConnect();
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    // Rate limit
    if (!checkRateLimit(session.user.id, 10, 60000)) {
      return NextResponse.json({ error: 'Rate limit exceeded. Please try again in 1 minute.' }, { status: 429 });
    }
    const article = await Article.findById(_id);
    if (!article) {
      return NextResponse.json({ error: 'Article not found' }, { status: 404 });
    }
    if (article.author.toString() !== session.user.id) {
      return NextResponse.json({ error: 'Forbidden: You are not the author of this article' }, { status: 403 });
    }
    const body = await request.json();
    // Validasi input
    if (body.title && body.title.length > 200) return NextResponse.json({ error: 'Title too long' }, { status: 400 });
    if (body.category && body.category.length > 50) return NextResponse.json({ error: 'Category too long' }, { status: 400 });
    if (body.tone && body.tone.length > 50) return NextResponse.json({ error: 'Tone too long' }, { status: 400 });
    if (body.language && body.language.length > 50) return NextResponse.json({ error: 'Language too long' }, { status: 400 });
    if (body.keywords && (!Array.isArray(body.keywords) || body.keywords.length > 10)) return NextResponse.json({ error: 'Keywords invalid or too many' }, { status: 400 });
    if (body.content && body.content.length > 10000) return NextResponse.json({ error: 'Content too long' }, { status: 400 });
    article.title = body.title || article.title;
    article.category = body.category || article.category;
    article.tone = body.tone || article.tone;
    article.language = body.language || article.language;
    article.wordCount = body.wordCount || article.wordCount;
    article.keywords = Array.isArray(body.keywords) ? body.keywords : article.keywords;
    article.content = body.content || article.content;
    await article.save();
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to update article', details: error instanceof Error ? error.message : 'Unknown error' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    await dbConnect();
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const body = await request.json();
    const { content, instructions } = body;
    if (!content || !instructions) {
      return NextResponse.json({ error: 'Content and instructions are required' }, { status: 400 });
    }
    // Proses AI rewrite/improve
    const improved = await openRouterService.improveArticle(content, instructions);
    return NextResponse.json({ success: true, improved });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to improve article', details: error instanceof Error ? error.message : 'Unknown error' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    await dbConnect();
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    // Rate limit
    if (!checkRateLimit(session.user.id, 10, 60000)) {
      return NextResponse.json({ error: 'Rate limit exceeded. Please try again in 1 minute.' }, { status: 429 });
    }
    const article = await Article.findById(id);
    if (!article) {
      return NextResponse.json({ error: 'Article not found' }, { status: 404 });
    }
    if (article.author.toString() !== session.user.id) {
      return NextResponse.json({ error: 'Forbidden: You are not the author of this article' }, { status: 403 });
    }
    await article.deleteOne();
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to delete article', details: error instanceof Error ? error.message : 'Unknown error' }, { status: 500 });
  }
} 