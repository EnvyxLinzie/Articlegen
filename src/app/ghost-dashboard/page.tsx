'use client';

import { useState, useEffect } from 'react';
import { useSession, signOut } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Loader2, Search, Trash2, Plus, Shield, Users, FileText, LogOut, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';

interface UserType {
  _id: string;
  name: string;
  email: string;
  role: string;
  articlesGenerated: number;
}

interface AdminType {
  _id: string;
  name: string;
  email: string;
  createdAt: string;
}

interface ArticleType {
  _id: string;
  title: string;
  author: string;
  authorName?: string;
  status: string;
  createdAt: string;
}

export default function GhostDashboardPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(true);
  const [users, setUsers] = useState<UserType[]>([]);
  const [admins, setAdmins] = useState<AdminType[]>([]);
  const [articles, setArticles] = useState<ArticleType[]>([]);
  const [userSearch, setUserSearch] = useState('');
  const [adminSearch, setAdminSearch] = useState('');
  const [articleSearch, setArticleSearch] = useState('');
  const [newAdmin, setNewAdmin] = useState({ name: '', email: '', password: '' });
  const [activeTab, setActiveTab] = useState('users');
  
  // Dialog states
  const [deleteDialog, setDeleteDialog] = useState<{
    isOpen: boolean;
    type: 'user' | 'admin' | 'article';
    id: string;
    name: string;
  }>({
    isOpen: false,
    type: 'user',
    id: '',
    name: ''
  });

  useEffect(() => {
    if (status === 'loading') return;

    // Check if user is admin
    if (!session?.user?.role || session.user.role !== 'admin') {
      router.push('/ghost-login');
      return;
    }

    fetchData();
  }, [session, status, router]);

  const fetchData = async () => {
    try {
      const [usersRes, adminsRes, articlesRes] = await Promise.all([
        fetch('/api/ghost-dashboard/users'),
        fetch('/api/ghost-dashboard/admins'),
        fetch('/api/ghost-dashboard/articles')
      ]);

      if (usersRes.ok) {
        const usersData = await usersRes.json();
        setUsers(usersData.users);
      }

      if (adminsRes.ok) {
        const adminsData = await adminsRes.json();
        setAdmins(adminsData.admins);
      }

      if (articlesRes.ok) {
        const articlesData = await articlesRes.json();
        setArticles(articlesData.articles);
      }
    } catch (error) {
      console.error('Error fetching data:', error);
      toast.error('Failed to load dashboard data');
    } finally {
      setIsLoading(false);
    }
  };

  const openDeleteDialog = (type: 'user' | 'admin' | 'article', id: string, name: string) => {
    setDeleteDialog({
      isOpen: true,
      type,
      id,
      name
    });
  };

  const closeDeleteDialog = () => {
    setDeleteDialog({
      isOpen: false,
      type: 'user',
      id: '',
      name: ''
    });
  };

  const handleDelete = async () => {
    const { type, id } = deleteDialog;
    
    try {
      let endpoint = '';
      switch (type) {
        case 'user':
          endpoint = `/api/ghost-dashboard/users?id=${id}`;
          break;
        case 'admin':
          endpoint = `/api/ghost-dashboard/admins?id=${id}`;
          break;
        case 'article':
          endpoint = `/api/ghost-dashboard/articles?id=${id}`;
          break;
      }

      const res = await fetch(endpoint, {
        method: 'DELETE',
      });

      if (res.ok) {
        // Update state based on type
        switch (type) {
          case 'user':
            setUsers(users.filter(user => user._id !== id));
            break;
          case 'admin':
            setAdmins(admins.filter(admin => admin._id !== id));
            break;
          case 'article':
            setArticles(articles.filter(article => article._id !== id));
            break;
        }
        
        toast.success(`${type.charAt(0).toUpperCase() + type.slice(1)} deleted successfully`);
      } else {
        toast.error(`Failed to delete ${type}`);
      }
    } catch (error) {
      console.error(`Error deleting ${type}:`, error);
      toast.error(`Failed to delete ${type}`);
    } finally {
      closeDeleteDialog();
    }
  };

  const handleCreateAdmin = async () => {
    if (!newAdmin.name || !newAdmin.email || !newAdmin.password) {
      toast.error('All fields are required');
      return;
    }

    try {
      const res = await fetch('/api/ghost-dashboard/admins', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newAdmin),
      });

      if (res.ok) {
        const data = await res.json();
        setAdmins([...admins, data.admin]);
        setNewAdmin({ name: '', email: '', password: '' });
        toast.success('Admin created successfully');
      } else {
        const error = await res.json();
        toast.error(error.error || 'Failed to create admin');
      }
    } catch (error) {
      console.error('Error creating admin:', error);
      toast.error('Failed to create admin');
    }
  };

  const filteredUsers = users.filter(user =>
    user.name.toLowerCase().includes(userSearch.toLowerCase()) ||
    user.email.toLowerCase().includes(userSearch.toLowerCase())
  );

  const filteredAdmins = admins.filter(admin =>
    admin.name.toLowerCase().includes(adminSearch.toLowerCase()) ||
    admin.email.toLowerCase().includes(adminSearch.toLowerCase())
  );

  const filteredArticles = articles.filter(article =>
    article.title.toLowerCase().includes(articleSearch.toLowerCase()) ||
    (article.authorName && article.authorName.toLowerCase().includes(articleSearch.toLowerCase()))
  );

  if (status === 'loading' || isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  if (!session?.user?.role || session.user.role !== 'admin') {
    return null;
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Shield className="h-6 w-6 text-red-600" />
            <span className="font-bold text-xl">Admin Dashboard</span>
          </div>
          <div className="flex items-center space-x-4">
            <span className="text-sm text-muted-foreground">
              Welcome, {session.user.name}
            </span>
            <Button variant="outline" size="sm" onClick={() => signOut()}>
              <LogOut className="h-4 w-4 mr-2" />
              Sign Out
            </Button>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="container mx-auto px-4 py-8">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="users" className="flex items-center space-x-2">
              <Users className="h-4 w-4" />
              <span>Users ({users.length})</span>
            </TabsTrigger>
            <TabsTrigger value="admins" className="flex items-center space-x-2">
              <Shield className="h-4 w-4" />
              <span>Admins ({admins.length})</span>
            </TabsTrigger>
            <TabsTrigger value="articles" className="flex items-center space-x-2">
              <FileText className="h-4 w-4" />
              <span>Articles ({articles.length})</span>
            </TabsTrigger>
          </TabsList>

          {/* Users Tab */}
          <TabsContent value="users" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>User Management</CardTitle>
                <CardDescription>
                  Manage all registered users in the system
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex items-center space-x-2 mb-4">
                  <Search className="h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search users..."
                    value={userSearch}
                    onChange={(e) => setUserSearch(e.target.value)}
                    className="max-w-sm"
                  />
                </div>
                <div className="space-y-2">
                  {filteredUsers.map((user) => (
                    <div key={user._id} className="flex items-center justify-between p-3 border rounded-lg">
                      <div>
                        <div className="font-medium">{user.name}</div>
                        <div className="text-sm text-muted-foreground">{user.email}</div>
                        <div className="flex items-center space-x-2 mt-1">
                          <Badge variant={user.role === 'admin' ? 'destructive' : 'secondary'}>
                            {user.role}
                          </Badge>
                          <span className="text-xs text-muted-foreground">
                            {user.articlesGenerated} articles
                          </span>
                        </div>
                      </div>
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => openDeleteDialog('user', user._id, user.name)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Admins Tab */}
          <TabsContent value="admins" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Admin Management</CardTitle>
                <CardDescription>
                  Manage admin accounts and create new ones
                </CardDescription>
              </CardHeader>
              <CardContent>
                {/* Create New Admin */}
                <div className="mb-6 p-4 border rounded-lg">
                  <h3 className="font-medium mb-3">Create New Admin</h3>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <Input
                      placeholder="Name"
                      value={newAdmin.name}
                      onChange={(e) => setNewAdmin({ ...newAdmin, name: e.target.value })}
                    />
                    <Input
                      placeholder="Email"
                      type="email"
                      value={newAdmin.email}
                      onChange={(e) => setNewAdmin({ ...newAdmin, email: e.target.value })}
                    />
                    <Input
                      placeholder="Password"
                      type="password"
                      value={newAdmin.password}
                      onChange={(e) => setNewAdmin({ ...newAdmin, password: e.target.value })}
                    />
                  </div>
                  <Button onClick={handleCreateAdmin} className="mt-3">
                    <Plus className="h-4 w-4 mr-2" />
                    Create Admin
                  </Button>
                </div>

                <div className="flex items-center space-x-2 mb-4">
                  <Search className="h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search admins..."
                    value={adminSearch}
                    onChange={(e) => setAdminSearch(e.target.value)}
                    className="max-w-sm"
                  />
                </div>
                <div className="space-y-2">
                  {filteredAdmins.map((admin) => (
                    <div key={admin._id} className="flex items-center justify-between p-3 border rounded-lg">
                      <div>
                        <div className="font-medium">{admin.name}</div>
                        <div className="text-sm text-muted-foreground">{admin.email}</div>
                        <div className="text-xs text-muted-foreground">
                          Created: {new Date(admin.createdAt).toLocaleDateString()}
                        </div>
                      </div>
                      <div className="flex items-center space-x-2">
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() => openDeleteDialog('admin', admin._id, admin.name)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Articles Tab */}
          <TabsContent value="articles" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Article Management</CardTitle>
                <CardDescription>
                  Manage all articles generated by users
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex items-center space-x-2 mb-4">
                  <Search className="h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search articles..."
                    value={articleSearch}
                    onChange={(e) => setArticleSearch(e.target.value)}
                    className="max-w-sm"
                  />
                </div>
                <div className="space-y-2">
                  {filteredArticles.map((article) => (
                    <div key={article._id} className="flex items-center justify-between p-3 border rounded-lg">
                      <div>
                        <div className="font-medium">{article.title}</div>
                        <div className="text-sm text-muted-foreground">
                          By: {article.authorName || 'Unknown'}
                        </div>
                        <div className="flex items-center space-x-2 mt-1">
                          <Badge variant={article.status === 'published' ? 'default' : 'secondary'}>
                            {article.status}
                          </Badge>
                          <span className="text-xs text-muted-foreground">
                            {new Date(article.createdAt).toLocaleDateString()}
                          </span>
                        </div>
                      </div>
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => openDeleteDialog('article', article._id, article.title)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialog.isOpen} onOpenChange={closeDeleteDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              Confirm Deletion
            </DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this {deleteDialog.type}? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <p className="text-sm text-muted-foreground">
              <strong>{deleteDialog.name}</strong> will be permanently removed from the system.
            </p>
          </div>
          <DialogFooter className="flex gap-2">
            <Button variant="outline" onClick={closeDeleteDialog}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDelete}>
              Delete {deleteDialog.type.charAt(0).toUpperCase() + deleteDialog.type.slice(1)}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
} 