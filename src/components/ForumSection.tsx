import { useState } from 'react';
import { 
  MessageSquare, 
  ThumbsUp, 
  Send, 
  Plus, 
  Lock, 
  Image as ImageIcon, 
  MapPin, 
  Calendar, 
  ShieldCheck, 
  User as UserIcon,
  X,
  Edit3,
  Trash2,
  Upload,
  Loader2,
} from 'lucide-react';
import { ForumPost, User, getMemberDisplayName } from '../types';
import { StorageService, playSound } from '../services/storage';
import { compressImageFile } from '../services/imageUtils';
import { paginateList } from '../services/syncResilience';
import { PhotoSourcePicker } from './PhotoSourcePicker';

interface ForumSectionProps {
  posts: ForumPost[];
  currentUser: User | null;
  onUpdatePosts: (posts: ForumPost[]) => void;
  onOpenAuth: () => void;
}

export default function ForumSection({
  posts,
  currentUser,
  onUpdatePosts,
  onOpenAuth,
}: ForumSectionProps) {
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [pageCount, setPageCount] = useState<number>(1);
  const [isCreatingPost, setIsCreatingPost] = useState(false);
  const [editingPost, setEditingPost] = useState<ForumPost | null>(null);
  const [newTitle, setNewTitle] = useState('');
  const [newContent, setNewContent] = useState('');
  const [newCategory, setNewCategory] = useState<'trip_report' | 'route_tips' | 'mechanics' | 'general'>('trip_report');
  const [newImages, setNewImages] = useState<string[]>([]);
  const [imageUrlInput, setImageUrlInput] = useState('');
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [commentInput, setCommentInput] = useState<{ [postId: string]: string }>({});
  const [confirmDeleteTarget, setConfirmDeleteTarget] = useState<{
    kind: 'post' | 'comment';
    postId: string;
    commentId?: string;
  } | null>(null);

  const isAdmin = currentUser?.role === 'admin' || currentUser?.email?.toLowerCase() === 'eliezerrmartins@gmail.com';
  const isMemberOrAdmin = currentUser && currentUser.status === 'active';

  const categories = [
    { id: 'all', label: 'Todos os Tópicos' },
    { id: 'trip_report', label: 'Relatos de Viagens' },
    { id: 'route_tips', label: 'Dicas de Rotas' },
    { id: 'mechanics', label: 'Mecânica & Customização' },
    { id: 'general', label: 'Geral & Confraternização' },
  ];

  const filteredPosts = selectedCategory === 'all'
    ? posts
    : posts.filter((p) => p.category === selectedCategory);

  const {
    visibleItems: pagedPosts,
    hasMore: hasMorePosts,
    remainingCount: remainingPostsCount,
  } = paginateList(filteredPosts, 10, pageCount);

  const handlePostImageFiles = async (files: File[]) => {
    if (!files || files.length === 0) return;
    setUploadError('');
    setIsUploadingImage(true);
    try {
      const compressed: string[] = [];
      for (const file of files) {
        const dataUrl = await compressImageFile(file, { maxDimension: 1024, maxChars: 200_000 });
        compressed.push(dataUrl);
      }
      setNewImages((prev) => [...prev, ...compressed].slice(0, 6));
      playSound('success');
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Erro ao processar imagem.');
      playSound('beep');
    } finally {
      setIsUploadingImage(false);
    }
  };

  const handleOpenCreatePost = () => {
    setEditingPost(null);
    setNewTitle('');
    setNewContent('');
    setNewCategory('trip_report');
    setNewImages([]);
    setImageUrlInput('');
    setUploadError('');
    setIsCreatingPost(true);
  };

  const handleOpenEditPost = (post: ForumPost) => {
    setEditingPost(post);
    setNewTitle(post.title);
    setNewContent(post.content);
    setNewCategory(post.category);
    setNewImages(post.images ? [...post.images] : []);
    setImageUrlInput('');
    setUploadError('');
    setIsCreatingPost(true);
  };

  const handleSavePost = (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser || !newTitle.trim() || !newContent.trim()) return;

    const finalImages = [
      ...newImages,
      ...(imageUrlInput.trim() ? [imageUrlInput.trim()] : []),
    ].slice(0, 6);

    if (editingPost) {
      const updated = posts.map((p) =>
        p.id === editingPost.id
          ? {
              ...p,
              title: newTitle.trim(),
              content: newContent.trim(),
              category: newCategory,
              images: finalImages,
            }
          : p
      );
      onUpdatePosts(updated);
      StorageService.setForumPosts(updated);
    } else {
      const newPost: ForumPost = {
        id: `post-${Date.now()}`,
        authorId: currentUser.id,
        authorName: `${getMemberDisplayName(currentUser)} (${currentUser.role === 'admin' ? 'Presidente' : currentUser.role === 'board' ? 'Diretoria' : 'Integrante'})`,
        authorRole: currentUser.role,
        authorAvatar: currentUser.avatarUrl,
        title: newTitle.trim(),
        content: newContent.trim(),
        category: newCategory,
        images: finalImages,
        likes: [currentUser.id],
        comments: [],
        createdAt: new Date().toISOString(),
      };

      const updated = [newPost, ...posts];
      onUpdatePosts(updated);
      StorageService.setForumPosts(updated);
    }

    playSound('success');
    setNewTitle('');
    setNewContent('');
    setNewImages([]);
    setImageUrlInput('');
    setEditingPost(null);
    setIsCreatingPost(false);
  };

  const handleDeletePost = (postId: string) => {
    if (!isAdmin) return;
    setConfirmDeleteTarget({ kind: 'post', postId });
  };

  const handleDeleteComment = (postId: string, commentId: string) => {
    if (!isAdmin) return;
    setConfirmDeleteTarget({ kind: 'comment', postId, commentId });
  };

  const handleConfirmDeleteTarget = () => {
    if (!confirmDeleteTarget || !isAdmin) return;
    if (confirmDeleteTarget.kind === 'post') {
      const updated = posts.filter((p) => p.id !== confirmDeleteTarget.postId);
      onUpdatePosts(updated);
      StorageService.setForumPosts(updated);
    } else if (confirmDeleteTarget.commentId) {
      const updated = posts.map((post) =>
        post.id === confirmDeleteTarget.postId
          ? { ...post, comments: post.comments.filter((c) => c.id !== confirmDeleteTarget.commentId) }
          : post
      );
      onUpdatePosts(updated);
      StorageService.setForumPosts(updated);
    }
    setConfirmDeleteTarget(null);
    playSound('click');
  };

  const handleToggleLike = (postId: string) => {
    if (!currentUser) {
      onOpenAuth();
      return;
    }

    const updated = posts.map((post) => {
      if (post.id === postId) {
        const hasLiked = post.likes.includes(currentUser.id);
        const likes = hasLiked
          ? post.likes.filter((id) => id !== currentUser.id)
          : [...post.likes, currentUser.id];
        return { ...post, likes };
      }
      return post;
    });

    onUpdatePosts(updated);
    StorageService.setForumPosts(updated);
    playSound('click');
  };

  const handleAddComment = (postId: string) => {
    const text = commentInput[postId]?.trim();
    if (!currentUser || !text) return;

    const updated = posts.map((post) => {
      if (post.id === postId) {
        const newComment = {
          id: `comment-${Date.now()}`,
          authorId: currentUser.id,
          authorName: getMemberDisplayName(currentUser),
          authorRole: currentUser.role,
          authorAvatar: currentUser.avatarUrl,
          content: text,
          createdAt: new Date().toISOString(),
        };
        return { ...post, comments: [...post.comments, newComment] };
      }
      return post;
    });

    onUpdatePosts(updated);
    StorageService.setForumPosts(updated);
    setCommentInput({ ...commentInput, [postId]: '' });
    playSound('beep');
  };

  // If user is visitor or pending, show locked screen
  if (!isMemberOrAdmin) {
    return (
      <div className="bg-[#121216] border border-zinc-800 rounded-2xl p-8 sm:p-12 text-center max-w-2xl mx-auto space-y-6 my-8">
        <div className="w-16 h-16 rounded-2xl bg-amber-400/10 border border-amber-400/30 flex items-center justify-center mx-auto text-amber-400">
          <Lock className="w-8 h-8" />
        </div>

        <div className="space-y-2">
          <h2 className="font-rock text-3xl font-bold uppercase text-white">
            Fórum Privado dos Integrantes
          </h2>
          <p className="text-zinc-400 text-sm leading-relaxed max-w-md mx-auto">
            Este espaço é exclusivo para integrantes e diretoria do Oficina do Rock Motoclube compartilharem relatos de viagens, rotas sigilosas e dicas de manutenção.
          </p>
        </div>

        <div className="pt-2 flex flex-col sm:flex-row items-center justify-center gap-3">
          <button
            onClick={onOpenAuth}
            className="w-full sm:w-auto px-6 py-3 bg-amber-400 hover:bg-amber-300 text-black font-rock text-xs font-bold uppercase tracking-wider rounded-lg transition-colors shadow-md shadow-amber-400/10"
          >
            Fazer Login de Integrante
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-4 border-b border-zinc-800">
        <div>
          <span className="text-xs font-bold text-amber-400 uppercase tracking-widest block">
            Irmandade & Histórias de Estrada
          </span>
          <h2 className="font-rock text-3xl font-bold uppercase text-white tracking-wide">
            Fórum Privado de Viagens & Motos
          </h2>
        </div>

        <button
          onClick={handleOpenCreatePost}
          className="px-4 py-2 bg-amber-400 hover:bg-amber-300 text-black text-xs font-bold uppercase tracking-wider rounded-lg flex items-center gap-1.5 transition-colors shadow-sm"
        >
          <Plus className="w-4 h-4" />
          <span>Compartilhar Relato</span>
        </button>
      </div>

      {/* Category Tabs */}
      <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-none">
        {categories.map((cat) => (
          <button
            key={cat.id}
            onClick={() => {
              setSelectedCategory(cat.id);
              setPageCount(1);
            }}
            className={`px-3.5 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap ${
              selectedCategory === cat.id
                ? 'bg-amber-400 text-black font-bold'
                : 'bg-zinc-900 text-zinc-400 hover:text-white hover:bg-zinc-800'
            }`}
          >
            {cat.label}
          </button>
        ))}
      </div>

      {/* Create / Edit Post Modal */}
      {isCreatingPost && (
        <div className="fixed inset-0 z-[70] flex items-start justify-center px-3 sm:px-4 pt-[max(3rem,calc(env(safe-area-inset-top)+1rem))] sm:pt-10 pb-8 bg-black/80 backdrop-blur-sm overflow-y-auto">
          <div className="bg-[#121216] border border-amber-400/40 rounded-2xl w-full max-w-2xl p-6 space-y-4 my-auto">
            <div className="flex items-center justify-between pb-3 border-b border-zinc-800">
              <div className="flex items-center gap-2">
                <MessageSquare className="w-5 h-5 text-amber-400" />
                <h3 className="font-rock text-lg font-bold uppercase text-white">
                  {editingPost ? 'Editar Tópico do Fórum (Admin)' : 'Novo Tópico / Relato de Viagem'}
                </h3>
              </div>
              <button
                onClick={() => {
                  setIsCreatingPost(false);
                  setEditingPost(null);
                }}
                className="text-zinc-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSavePost} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-zinc-300 uppercase mb-1">
                  Título do Relato *
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ex: Viagem de 1.200km pelas curvas da Serra do Rio do Rastro"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-700 rounded-lg px-3.5 py-2 text-sm text-white focus:outline-none focus:border-amber-400"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-zinc-300 uppercase mb-1">
                  Categoria *
                </label>
                <select
                  value={newCategory}
                  onChange={(e) => setNewCategory(e.target.value as any)}
                  className="w-full bg-zinc-950 border border-zinc-700 rounded-lg px-3.5 py-2 text-sm text-white focus:outline-none focus:border-amber-400"
                >
                  <option value="trip_report">Relato de Viagem</option>
                  <option value="route_tips">Dica de Rota</option>
                  <option value="mechanics">Mecânica & Customização</option>
                  <option value="general">Geral & Confraternização</option>
                </select>
              </div>

              <div className="space-y-2">
                <label className="block text-xs font-bold text-zinc-300 uppercase">
                  Fotos da Viagem / Moto (Galeria Nativa, Google Fotos ou URL — até 6 fotos)
                </label>
                <div className="flex flex-col sm:flex-row gap-2">
                  <PhotoSourcePicker
                    multiple={true}
                    disabled={isUploadingImage}
                    title="Adicionar Fotos ao Fórum"
                    onSelectFiles={handlePostImageFiles}
                    className="shrink-0"
                  >
                    <div className="cursor-pointer px-3.5 py-2 bg-zinc-950 hover:bg-zinc-900 border border-dashed border-amber-400/50 rounded-lg text-xs font-bold text-amber-400 flex items-center justify-center gap-1.5 transition-colors">
                      {isUploadingImage ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Upload className="w-3.5 h-3.5" />
                      )}
                      <span>{isUploadingImage ? 'Otimizando...' : 'Carregar Foto(s)'}</span>
                    </div>
                  </PhotoSourcePicker>
                  <input
                    type="text"
                    placeholder="Ou cole a URL da foto (https://...)"
                    value={imageUrlInput}
                    onChange={(e) => setImageUrlInput(e.target.value)}
                    className="flex-1 bg-zinc-950 border border-zinc-700 rounded-lg px-3.5 py-2 text-sm text-white focus:outline-none focus:border-amber-400"
                  />
                </div>
                {uploadError && (
                  <p className="text-[11px] text-red-400 font-semibold mt-1">{uploadError}</p>
                )}
                {newImages.length > 0 && (
                  <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 pt-1">
                    {newImages.map((imgUrl, idx) => (
                      <div key={idx} className="relative aspect-square rounded-lg overflow-hidden border border-zinc-700 bg-black">
                        <img src={imgUrl} alt={`Foto ${idx + 1}`} className="w-full h-full object-cover" />
                        <button
                          type="button"
                          onClick={() => setNewImages((prev) => prev.filter((_, i) => i !== idx))}
                          className="absolute top-1 right-1 p-1 rounded bg-red-600 text-white hover:bg-red-500"
                          title="Remover foto"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <label className="block text-xs font-bold text-zinc-300 uppercase mb-1">
                  Texto do Relato / Detalhes da Estrada *
                </label>
                <textarea
                  rows={6}
                  required
                  placeholder="Conte para os irmãos como foi o trajeto, paradas de abastecimento, qualidade do asfalto e momentos marcantes..."
                  value={newContent}
                  onChange={(e) => setNewContent(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-700 rounded-lg p-3 text-sm text-white focus:outline-none focus:border-amber-400"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-zinc-800">
                <button
                  type="button"
                  onClick={() => {
                    setIsCreatingPost(false);
                    setEditingPost(null);
                  }}
                  className="px-4 py-2 bg-zinc-800 text-zinc-300 rounded-lg text-xs font-bold uppercase hover:bg-zinc-700"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-amber-400 hover:bg-amber-300 text-black rounded-lg text-xs font-bold uppercase font-rock"
                >
                  {editingPost ? 'Salvar Alterações' : 'Publicar no Fórum'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Posts List */}
      <div className="space-y-6">
        {pagedPosts.map((post) => {
          const hasLiked = currentUser ? post.likes.includes(currentUser.id) : false;

          return (
            <article
              key={post.id}
              className="bg-[#121216] border border-zinc-800/90 rounded-2xl p-6 sm:p-8 space-y-5 shadow-lg"
            >
              {/* Author & Header */}
              <div className="flex items-center justify-between gap-4 flex-wrap">
                <div className="flex items-center gap-3">
                  <img
                    src={post.authorAvatar || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=100&q=80'}
                    alt={post.authorName}
                    className="w-10 h-10 rounded-full object-cover border border-amber-400/50"
                  />
                  <div>
                    <span className="text-sm font-semibold text-white block">
                      {post.authorName}
                    </span>
                    <span className="text-[11px] text-zinc-400 block">
                      {new Date(post.createdAt).toLocaleDateString('pt-BR')} · {categories.find(c => c.id === post.category)?.label}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <span className="px-2.5 py-1 rounded bg-zinc-900 border border-zinc-800 text-[10px] font-bold text-amber-400 uppercase tracking-wider">
                    Área Reservada
                  </span>
                  {isAdmin && (
                    <>
                      <button
                        onClick={() => handleOpenEditPost(post)}
                        className="p-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-amber-400 transition-colors"
                        title="Editar Tópico (Admin)"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleDeletePost(post.id)}
                        className="p-1.5 rounded-lg bg-zinc-800 hover:bg-red-950 text-zinc-400 hover:text-red-400 transition-colors"
                        title="Excluir Tópico (Admin)"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </>
                  )}
                </div>
              </div>

              <h3 className="font-rock text-2xl font-bold uppercase text-white leading-tight">
                {post.title}
              </h3>

              <div className="text-sm text-zinc-300 leading-relaxed whitespace-pre-line">
                {post.content}
              </div>

              {/* Photos in post */}
              {post.images && post.images.length > 0 && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                  {post.images.map((img, idx) => (
                    <div key={idx} className="h-64 rounded-xl overflow-hidden bg-zinc-950 border border-zinc-800">
                      <img
                        src={img}
                        alt="Foto da viagem"
                        referrerPolicy="no-referrer"
                        className="w-full h-full object-cover"
                      />
                    </div>
                  ))}
                </div>
              )}

              {/* Actions: Likes & Comments counter */}
              <div className="flex items-center gap-4 pt-4 border-t border-zinc-800 text-xs">
                <button
                  onClick={() => handleToggleLike(post.id)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md font-semibold transition-colors ${
                    hasLiked
                      ? 'bg-amber-400/20 text-amber-400 border border-amber-400/40'
                      : 'bg-zinc-900 text-zinc-400 hover:text-white'
                  }`}
                >
                  <ThumbsUp className="w-4 h-4" />
                  <span>{post.likes.length} Curtidas</span>
                </button>

                <span className="text-zinc-500">·</span>

                <span className="text-zinc-400 font-medium">
                  {post.comments.length} {post.comments.length === 1 ? 'comentário' : 'comentários'}
                </span>
              </div>

              {/* Comments Section */}
              <div className="pt-2 space-y-3">
                {post.comments.map((comm) => (
                  <div
                    key={comm.id}
                    className="p-3 rounded-xl bg-zinc-950/70 border border-zinc-800/80 space-y-1"
                  >
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-bold text-amber-400">{comm.authorName}</span>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] text-zinc-500">
                          {new Date(comm.createdAt).toLocaleDateString('pt-BR')}
                        </span>
                        {isAdmin && (
                          <button
                            onClick={() => handleDeleteComment(post.id, comm.id)}
                            className="text-zinc-500 hover:text-red-400 transition-colors"
                            title="Remover Comentário (Admin)"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                    </div>
                    <p className="text-xs text-zinc-300">{comm.content}</p>
                  </div>
                ))}

                {/* Add Comment Input */}
                <div className="flex items-center gap-2 pt-2">
                  <input
                    type="text"
                    placeholder="Escreva um comentário para o irmão..."
                    value={commentInput[post.id] || ''}
                    onChange={(e) => setCommentInput({ ...commentInput, [post.id]: e.target.value })}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleAddComment(post.id);
                    }}
                    className="flex-1 bg-zinc-950 border border-zinc-700 rounded-lg px-3.5 py-2 text-xs text-white focus:outline-none focus:border-amber-400"
                  />
                  <button
                    onClick={() => handleAddComment(post.id)}
                    className="px-4 py-2 rounded-lg bg-amber-400 hover:bg-amber-300 text-black text-xs font-bold uppercase flex items-center gap-1.5 transition-colors"
                  >
                    <Send className="w-3.5 h-3.5" />
                    <span>Enviar</span>
                  </button>
                </div>
              </div>
            </article>
          );
        })}

        {hasMorePosts && (
          <div className="flex justify-center pt-2">
            <button
              type="button"
              onClick={() => {
                setPageCount((prev) => prev + 1);
                playSound('click');
              }}
              className="px-5 py-2.5 bg-zinc-900 hover:bg-zinc-800 text-amber-300 border border-amber-400/40 rounded-xl text-xs font-bold uppercase tracking-wider transition-colors"
            >
              Carregar mais tópicos (+{remainingPostsCount} restante{remainingPostsCount === 1 ? '' : 's'})
            </button>
          </div>
        )}
      </div>

      {/* Confirmation Modal */}
      {confirmDeleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-sm">
          <div className="bg-[#121216] border border-red-500/40 rounded-2xl w-full max-w-sm p-5 space-y-4 shadow-2xl">
            <div className="flex items-center gap-2 text-red-400">
              <Trash2 className="w-5 h-5" />
              <h4 className="font-rock text-base font-bold uppercase text-white">
                {confirmDeleteTarget.kind === 'post' ? 'Excluir Tópico do Fórum' : 'Remover Comentário'}
              </h4>
            </div>
            <p className="text-xs text-zinc-300">
              {confirmDeleteTarget.kind === 'post'
                ? 'Deseja realmente excluir este tópico e seus comentários permanentemente?'
                : 'Deseja realmente remover este comentário?'}
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmDeleteTarget(null)}
                className="px-3.5 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg text-xs font-bold uppercase"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleConfirmDeleteTarget}
                className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white rounded-lg text-xs font-bold uppercase"
              >
                Excluir
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
