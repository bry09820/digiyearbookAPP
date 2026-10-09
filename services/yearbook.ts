import api, { asArray, imageUrl, unwrap, ApiClientError } from '@/services/api';
import { API_TIMEOUT_MS } from '@/constants/config';
import { asText, firstText } from '@/utils/text';
import { isRestrictedProfilePayload } from '@/utils/subscription';

export type DirectoryStudent = {
  id: string | number;
  name: string;
  degree: string;
  year: string;
  section: string;
  image: string | null;
  bio: string;
  student_id?: string;
  course?: string;
  email?: string;
  first_name?: string;
  last_name?: string;
  graduation_year?: string;
  /** True when viewer is free-tier and only public teaser fields are available. */
  restricted?: boolean;
};

export type FacultyMember = {
  id: string | number;
  name: string;
  role: string;
  image: string | null;
  bio: string;
  email?: string;
  department?: string;
};

export type GalleryAlbum = {
  id: string | number;
  title: string;
  photos: number;
  time: string;
  image: string | null;
  gridImages: string[];
  description?: string;
};

export type SectionCard = {
  id: string | number;
  title: string;
  adviser: string;
  mainImage: string | null;
  students: DirectoryStudent[];
  students_count?: number;
  batch_label?: string;
};

export type AnnouncementItem = {
  id: string | number;
  title: string;
  location: string;
  date: string;
  status: string;
  description: string;
  type?: string;
};

export type AchievementItem = {
  id: string | number;
  title: string;
  name: string;
  desc: string;
  date: string;
  image: string | null;
  type?: string;
  category?: string;
};

function formatRelative(dateLike?: string | null): string {
  if (!dateLike) return 'Updated recently';
  const date = new Date(dateLike);
  if (Number.isNaN(date.getTime())) return 'Updated recently';
  const diffMs = Date.now() - date.getTime();
  const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (days <= 0) return 'Updated today';
  if (days === 1) return 'Updated 1 day ago';
  if (days < 14) return `Updated ${days} days ago`;
  return date.toLocaleDateString();
}

function formatShortDate(dateLike?: unknown): string {
  const raw = asText(dateLike);
  if (!raw) return '';
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return raw;
  return date
    .toLocaleDateString('en-US', { month: 'short', day: '2-digit' })
    .toUpperCase();
}

/** Resolve nested Laravel relations (adviser / user / section) to a display string. */
function resolvePersonName(value: unknown, fallback = ''): string {
  if (typeof value === 'string' && value.trim()) return value.trim();
  if (value && typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    return (
      firstText(
        obj.name,
        obj.full_name,
        obj.adviser_name,
        [asText(obj.first_name), asText(obj.last_name)].filter(Boolean).join(' '),
      ) || fallback
    );
  }
  return fallback;
}

function mapStudent(raw: Record<string, unknown>): DirectoryStudent {
  const name =
    firstText(
      raw.name,
      [asText(raw.first_name), asText(raw.last_name)].filter(Boolean).join(' '),
    ) || 'Student';
  const course = firstText(raw.course, raw.course_short, raw.program);

  let section = '—';
  if (typeof raw.section === 'string' && raw.section.trim()) {
    section = raw.section.trim();
  } else if (raw.section && typeof raw.section === 'object') {
    section = resolvePersonName(raw.section, '—') || asText((raw.section as { name?: string }).name, '—');
  } else if (asText(raw.course_short)) {
    section = asText(raw.course_short);
  } else if (asText(raw.section_name)) {
    section = asText(raw.section_name);
  } else if (course) {
    section = course;
  }

  const year =
    firstText(
      raw.year_level,
      asText(raw.batch_year) ? `Batch ${asText(raw.batch_year)}` : '',
      asText(raw.graduation_year) ? `Class of ${asText(raw.graduation_year)}` : '',
    ) || 'Student';

  const id = raw.id ?? raw.user_id ?? name;

  return {
    id: typeof id === 'string' || typeof id === 'number' ? id : String(id),
    name,
    degree: course || 'NU Lipa',
    year,
    section,
    image: imageUrl(raw.profile_picture || raw.photo || raw.image || raw.avatar),
    bio:
      firstText(raw.bio, raw.motto, raw.about) ||
      `${name} — ${course || 'NU Lipa student'}.`,
    student_id: asText(raw.student_id) || undefined,
    course: course || undefined,
    email: asText(raw.email) || undefined,
    first_name: asText(raw.first_name) || undefined,
    last_name: asText(raw.last_name) || undefined,
    graduation_year: asText(raw.graduation_year) || undefined,
  };
}

function firstAlbumCover(album: Record<string, unknown>): string | null {
  const photos = (album.photos as unknown[]) || (album.media as unknown[]) || [];
  const firstPhoto = photos[0] as Record<string, unknown> | undefined;
  return (
    imageUrl(album.cover_image) ||
    imageUrl(album.thumbnail) ||
    imageUrl(album.image) ||
    imageUrl(firstPhoto?.file_path) ||
    imageUrl(firstPhoto?.url) ||
    imageUrl(firstPhoto)
  );
}

/**
 * Live yearbook data services — mirrors sinag-bughaw-web / Laravel api.php routes.
 */
export const yearbookService = {
  async getCurrentUser() {
    const { data } = await api.get('/auth/me');
    // Normalize Laravel shapes: bare user, `{ user }`, or `{ data: user }`.
    const payload = unwrap(data) as Record<string, unknown> | unknown;
    let user: unknown = data;
    if (payload && typeof payload === 'object') {
      const obj = payload as Record<string, unknown>;
      user = obj.user && typeof obj.user === 'object' ? obj.user : obj;
    } else if (data && typeof data === 'object' && (data as { user?: unknown }).user) {
      user = (data as { user: unknown }).user;
    }

    // Guarantee profile_visibility is present for settings screens.
    // Older /auth/me payloads omitted it, which caused Private → Public on reopen.
    if (user && typeof user === 'object') {
      const raw = user as Record<string, unknown>;
      const nested =
        (raw.student_record as Record<string, unknown> | undefined) ||
        (raw.studentRecord as Record<string, unknown> | undefined) ||
        (raw.student as Record<string, unknown> | undefined) ||
        {};
      const visibilityRaw = firstText(
        raw.profile_visibility,
        raw.visibility,
        raw.privacy,
        nested.profile_visibility,
        nested.visibility,
      )
        .toLowerCase()
        .trim();
      let normalized: 'public' | 'batchmates' | 'private' | undefined;
      if (
        visibilityRaw === 'alumni_only' ||
        visibilityRaw === 'alumni' ||
        visibilityRaw === 'batch' ||
        visibilityRaw === 'batchmate'
      ) {
        normalized = 'batchmates';
      } else if (
        visibilityRaw === 'only_me' ||
        visibilityRaw === 'me' ||
        visibilityRaw === 'hidden' ||
        visibilityRaw === 'none'
      ) {
        normalized = 'private';
      } else if (
        visibilityRaw === 'public' ||
        visibilityRaw === 'batchmates' ||
        visibilityRaw === 'private'
      ) {
        normalized = visibilityRaw;
      }
      if (normalized) {
        return {
          ...raw,
          profile_visibility: normalized,
          visibility: normalized,
        };
      }
    }

    return user;
  },

  async getAnnouncements(): Promise<AnnouncementItem[]> {
    const { data } = await api.get('/announcements');
    const rows = asArray<Record<string, unknown>>(data);
    return rows.map((row) => ({
      id: (row.id as string | number) ?? asText(row.title, 'announcement'),
      title: asText(row.title, 'Announcement'),
      location: asText(row.location, 'NU Lipa'),
      date: formatShortDate(row.event_date ?? row.created_at),
      status: asText(row.type, 'information').toUpperCase(),
      description: firstText(row.body, row.content, row.description),
      type: asText(row.type) || undefined,
    }));
  },

  async getFeed(params: Record<string, unknown> = {}) {
    const { data } = await api.get('/feed', { params });
    return data;
  },

  async getBatchmates(params: Record<string, unknown> = {}) {
    const { data } = await api.get('/batchmates', { params });
    return asArray(data).map((row) => mapStudent(row as Record<string, unknown>));
  },

  async getMemoryDigest(params: Record<string, unknown> = {}) {
    const { data } = await api.get('/dashboard/memory-digest', { params });
    return data;
  },

  async getMyStats() {
    const { data } = await api.get('/analytics/my-stats');
    return data;
  },

  async getProfileAchievements(): Promise<AchievementItem[]> {
    const { data } = await api.get('/profile/achievements');
    const rows = asArray<Record<string, unknown>>(data);
    return rows.map((row) => ({
      id: (row.id as string | number) ?? asText(row.title, 'achievement'),
      title: asText(row.title, 'Achievement'),
      name: firstText(row.subtitle, row.name, 'You') || 'You',
      desc: firstText(row.subtitle, row.description),
      date: formatShortDate(row.date_awarded ?? row.created_at),
      image: imageUrl(row.image || row.icon),
      type: asText(row.type) || undefined,
      category: firstText(row.type, 'Achievement') || 'Achievement',
    }));
  },

  async getStudentAchievements(id: string | number): Promise<AchievementItem[]> {
    const { data } = await api.get(`/students/${id}/achievements`);
    const rows = asArray<Record<string, unknown>>(data);
    return rows.map((row) => ({
      id: (row.id as string | number) ?? asText(row.title, 'achievement'),
      title: asText(row.title, 'Achievement'),
      name: firstText(row.subtitle, row.name),
      desc: firstText(row.subtitle, row.description),
      date: formatShortDate(row.date_awarded ?? row.created_at),
      image: imageUrl(row.image),
      type: asText(row.type) || undefined,
      category: firstText(row.type, 'Achievement') || 'Achievement',
    }));
  },

  async getTopViewed(limit = 12): Promise<AchievementItem[]> {
    const { data } = await api.get('/analytics/top-viewed', { params: { limit } });
    const rows = asArray<Record<string, unknown>>(data);
    return rows.map((row, index) => {
      const student = mapStudent(row);
      return {
        id: student.id,
        title: `Top Viewed #${index + 1}`,
        name: student.name,
        desc: student.bio,
        date: student.year,
        image: student.image,
        category: 'Most Viewed',
      };
    });
  },

  async getTrending(): Promise<AchievementItem[]> {
    const { data } = await api.get('/analytics/trending');
    const rows = asArray<Record<string, unknown>>(data);
    return rows.map((row) => {
      const student = mapStudent(row);
      const views = row.views_this_week ?? row.views;
      return {
        id: student.id,
        title: 'Trending Scholar',
        name: student.name,
        desc:
          views != null
            ? `${asText(views)} views this week · ${student.degree}`
            : student.bio,
        date: student.year,
        image: student.image,
        category: 'Trending',
      };
    });
  },

  async getStudents(params: Record<string, unknown> = {}): Promise<{
    students: DirectoryStudent[];
    meta?: Record<string, unknown>;
  }> {
    const { data } = await api.get('/search/students', { params });
    const students = asArray(data).map((row) => mapStudent(row as Record<string, unknown>));
    const meta = (data as { meta?: Record<string, unknown> })?.meta;
    return { students, meta };
  },

  async getSearchFilters(): Promise<{ courses: string[]; batch_years: string[] }> {
    try {
      const { data } = await api.get('/search/students/filters');
      const payload = unwrap<Record<string, unknown>>(data) as Record<string, unknown>;
      const courses = asArray(payload.courses)
        .map((c) => asText(c))
        .filter(Boolean);
      const batchYears = asArray(payload.batch_years ?? payload.years)
        .map((y) => asText(y))
        .filter(Boolean);
      return { courses, batch_years: batchYears };
    } catch {
      return { courses: [], batch_years: [] };
    }
  },

  async getStudent(id: string | number): Promise<DirectoryStudent> {
    try {
      const { data } = await api.get(`/students/${id}`);
      const raw = (unwrap(data) || data) as Record<string, unknown>;
      const nested = (raw as { student?: Record<string, unknown> }).student;
      const studentRaw = nested && typeof nested === 'object' ? nested : raw;
      const mapped = mapStudent(studentRaw);

      if (isRestrictedProfilePayload(raw) || isRestrictedProfilePayload(data)) {
        return { ...mapped, restricted: true };
      }

      return { ...mapped, restricted: false };
    } catch (error) {
      // Free-tier viewers get HTTP 402 with a name-only teaser payload.
      if (error instanceof ApiClientError && error.status === 402) {
        const payload = (error.data || {}) as Record<string, unknown>;
        const nested =
          (payload.student as Record<string, unknown> | undefined) ||
          (payload.data as Record<string, unknown> | undefined) ||
          payload;
        const mapped = mapStudent(
          nested && typeof nested === 'object' ? nested : { name: 'Student', id },
        );
        return {
          ...mapped,
          id: mapped.id || id,
          restricted: true,
        };
      }
      throw error;
    }
  },

  async getFaculty(params: Record<string, unknown> = {}): Promise<
    { name: string; faculty: FacultyMember[] }[]
  > {
    const { data } = await api.get('/faculty/by-department', { params });
    const groups = asArray<Record<string, unknown>>(data);
    return groups.map((group) => {
      const groupName = firstText(group.name, group.id, 'Department') || 'Department';
      return {
        name: groupName,
        faculty: asArray(group.faculty).map((member) => {
          const row = member as Record<string, unknown>;
          const memberName = asText(row.name, 'Faculty');
          return {
            id: (row.id as string | number) ?? memberName,
            name: memberName,
            role: firstText(row.position, row.role, 'Faculty') || 'Faculty',
            image: imageUrl(row.image_url || row.image || row.photo || row.avatar),
            bio:
              firstText(row.bio, row.description) ||
              `${memberName} — ${firstText(row.department, groupName) || 'NU Lipa'}.`,
            email: asText(row.email) || undefined,
            department: firstText(row.department, groupName) || undefined,
          };
        }),
      };
    });
  },

  async getGalleryAlbums(params: Record<string, unknown> = {}): Promise<GalleryAlbum[]> {
    let data: unknown;
    try {
      ({ data } = await api.get('/gallery/albums', { params }));
    } catch {
      ({ data } = await api.get('/gallery', { params }));
    }

    const albums = asArray<Record<string, unknown>>(data);
    return albums.map((album) => {
      const photos = asArray(album.photos || album.media) as Record<string, unknown>[];
      const gridImages = photos
        .map((photo) => imageUrl(photo.file_path || photo.url || photo))
        .filter((url): url is string => Boolean(url));

      return {
        id: (album.id as string | number) ?? asText(album.title, 'album'),
        title: firstText(album.title, album.name, 'Album') || 'Album',
        photos:
          Number(album.photos_count ?? album.media_count ?? photos.length ?? 0) ||
          gridImages.length,
        time: formatRelative(asText(album.updated_at) || asText(album.created_at) || null),
        image: firstAlbumCover(album) || gridImages[0] || null,
        gridImages,
        description: asText(album.description),
      };
    });
  },

  async getGalleryAlbum(id: string | number): Promise<GalleryAlbum> {
    const { data } = await api.get(`/gallery/${id}`);
    const album = (unwrap(data) || data) as Record<string, unknown>;
    const photos = asArray(album.photos || album.media) as Record<string, unknown>[];
    const gridImages = photos
      .map((photo) => imageUrl(photo.file_path || photo.url || photo))
      .filter((url): url is string => Boolean(url));

    return {
      id: (album.id as string | number) ?? id,
      title: firstText(album.title, album.name, 'Album') || 'Album',
      photos: Number(album.photos_count ?? photos.length ?? 0) || gridImages.length,
      time: formatRelative(asText(album.updated_at) || asText(album.created_at) || null),
      image: firstAlbumCover(album) || gridImages[0] || null,
      gridImages,
      description: asText(album.description),
    };
  },

  async getSections(params: Record<string, unknown> = {}): Promise<SectionCard[]> {
    const { data } = await api.get('/sections', { params });
    const sections = asArray<Record<string, unknown>>(data);

    return sections.map((section) => {
      const studentsRaw = asArray(
        (section.students as { data?: unknown })?.data ?? section.students,
      ) as Record<string, unknown>[];
      const students = studentsRaw.map(mapStudent);
      const batch = section.batch ?? section.graduation_year;
      let batchLabel: string | undefined;
      if (batch && typeof batch === 'object') {
        const batchObj = batch as { name?: string; graduation_year?: number };
        batchLabel =
          asText(batchObj.name) ||
          (batchObj.graduation_year != null ? `BATCH ${batchObj.graduation_year}` : undefined);
      } else if (batch != null && batch !== '') {
        batchLabel = `BATCH ${asText(batch)}`;
      }

      const adviser = firstText(
        section.adviser_name,
        resolvePersonName(section.adviser),
        resolvePersonName(section.class_adviser),
        'Class Adviser',
      );

      return {
        id: (section.id as string | number) ?? asText(section.name, 'section'),
        title: firstText(section.name, section.title, 'Section') || 'Section',
        adviser: adviser || 'Class Adviser',
        mainImage:
          imageUrl(section.group_photo || section.cover_image || section.image) ||
          students[0]?.image ||
          null,
        students,
        students_count: Number(section.students_count ?? students.length),
        batch_label: batchLabel,
      };
    });
  },

  async getSection(id: string | number): Promise<SectionCard> {
    const { data } = await api.get(`/sections/${id}`);
    const payload = data as Record<string, unknown>;
    const section =
      (payload.section as Record<string, unknown>) ||
      (unwrap(payload) as Record<string, unknown>) ||
      payload;
    const studentsPage = payload.students as { data?: unknown } | unknown[] | undefined;
    const studentsRaw = asArray(
      (studentsPage as { data?: unknown })?.data ??
        studentsPage ??
        (section as { students?: unknown }).students,
    ) as Record<string, unknown>[];

    const adviser = firstText(
      section.adviser_name,
      resolvePersonName(section.adviser),
      resolvePersonName(section.class_adviser),
      'Class Adviser',
    );

    return {
      id: (section.id as string | number) ?? id,
      title: firstText(section.name, section.title, 'Section') || 'Section',
      adviser: adviser || 'Class Adviser',
      mainImage: imageUrl(section.group_photo || section.cover_image),
      students: studentsRaw.map(mapStudent),
      students_count: Number(payload.total ?? studentsRaw.length),
    };
  },

  async updateProfileBio(bio: string) {
    const { data } = await api.post('/students/profile/bio', { bio });
    return data;
  },

  /**
   * Matches web `POST /profile/visibility` — public | batchmates | private.
   * Returns the confirmed visibility from the API when available.
   */
  async updateVisibility(visibility: 'public' | 'batchmates' | 'private'): Promise<{
    visibility: 'public' | 'batchmates' | 'private';
    raw: unknown;
  }> {
    const { data } = await api.post('/profile/visibility', { visibility });
    const payload =
      data && typeof data === 'object' ? (data as Record<string, unknown>) : {};
    const nestedUser =
      payload.user && typeof payload.user === 'object'
        ? (payload.user as Record<string, unknown>)
        : null;
    const confirmed = firstText(
      payload.profile_visibility,
      payload.visibility,
      nestedUser?.profile_visibility,
      nestedUser?.visibility,
      visibility,
    );
    const normalized =
      confirmed === 'alumni_only'
        ? 'batchmates'
        : confirmed === 'public' || confirmed === 'batchmates' || confirmed === 'private'
          ? confirmed
          : visibility;
    return { visibility: normalized, raw: data };
  },

  /** Matches web `POST /profile/motto` — yearbook quote (max 255). */
  async updateMotto(motto: string | null) {
    const { data } = await api.post('/profile/motto', { motto });
    return data;
  },

  async updatePassword(payload: {
    current_password: string;
    password: string;
    password_confirmation: string;
  }) {
    const { data } = await api.put('/students/profile/password', payload);
    return data;
  },

  async updateAcademic(payload: Record<string, unknown>) {
    const { data } = await api.put('/profile/academic', payload);
    return data;
  },

  /**
   * Persist achievements list — matches web `PUT /profile/achievements`.
   * Pass `id: null` for new rows; real DB ids for existing ones.
   */
  async updateAchievements(
    achievements: Array<{
      id: string | number | null;
      title: string;
      subtitle?: string;
      type?: string;
    }>,
  ) {
    const { data } = await api.put('/profile/achievements', { achievements });
    return data;
  },

  /** Alumni career profile — `GET /alumni/me`. */
  async getAlumniCareer(): Promise<{
    job_title: string;
    company: string;
    location: string;
    field: string;
    bio: string;
  }> {
    const { data } = await api.get('/alumni/me');
    const payload = (unwrap(data) || data) as Record<string, unknown>;
    const nested = (payload.data as Record<string, unknown> | undefined) ?? payload;
    const career =
      (nested.career as Record<string, unknown> | undefined) ??
      (payload.career as Record<string, unknown> | undefined) ??
      {};
    return {
      job_title: asText(career.job_title),
      company: asText(career.company),
      location: asText(career.location),
      field: asText(career.field),
      bio: asText(career.bio),
    };
  },

  /** Alumni career update — `POST /alumni/career`. */
  async updateCareer(payload: {
    job_title?: string | null;
    company?: string | null;
    location?: string | null;
    field?: string | null;
    bio?: string | null;
  }) {
    const { data } = await api.post('/alumni/career', payload);
    return data;
  },

  /**
   * Upload profile avatar (multipart). Tries common Sinag-Bughaw / Laravel routes
   * and field names until one succeeds.
   */
  async uploadProfilePicture(localUri: string): Promise<{ url: string | null; data: unknown }> {
    const filename = localUri.split('/').pop() || `avatar-${Date.now()}.jpg`;
    const ext = filename.includes('.') ? filename.split('.').pop()?.toLowerCase() : 'jpg';
    const mime =
      ext === 'png'
        ? 'image/png'
        : ext === 'gif'
          ? 'image/gif'
          : ext === 'webp'
            ? 'image/webp'
            : 'image/jpeg';

    const endpoints = [
      '/students/profile/picture',
      '/students/profile/photo',
      '/students/profile/avatar',
      '/profile/picture',
      '/profile/avatar',
    ];
    const fieldNames = ['profile_picture', 'photo', 'avatar', 'image'];

    let lastError: unknown;

    for (const endpoint of endpoints) {
      for (const field of fieldNames) {
        try {
          const form = new FormData();
          form.append(field, {
            uri: localUri,
            name: filename.endsWith(`.${ext}`) ? filename : `${filename}.${ext || 'jpg'}`,
            type: mime,
          } as unknown as Blob);

          const { data } = await api.post(endpoint, form, {
            headers: {
              Accept: 'application/json',
            },
            timeout: Math.max(API_TIMEOUT_MS, 120000),
          });

          const payload = (unwrap(data) || data) as Record<string, unknown>;
          const user = (payload.user as Record<string, unknown>) || payload;
          const url =
            imageUrl(
              user.profile_picture ||
                user.photo ||
                user.avatar ||
                user.image ||
                payload.profile_picture ||
                payload.url ||
                payload.path,
            ) || null;

          return { url, data };
        } catch (err) {
          lastError = err;
        }
      }
    }

    throw lastError instanceof Error
      ? lastError
      : new Error('Unable to upload profile picture. Check the Laravel upload route.');
  },

  /** Soft-record a profile view when the analytics endpoint exists. */
  async recordStudentView(id: string | number): Promise<void> {
    try {
      await api.post(`/students/${id}/view`);
    } catch {
      try {
        await api.post('/analytics/profile-view', { student_id: id });
      } catch {
        // Optional analytics — ignore failures.
      }
    }
  },
};

export default yearbookService;
