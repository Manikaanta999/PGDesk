import demoVideoThumbnailImg from '../assets/images/demo_video_thumbnail_1794744352742.jpg';
import heroHostelDevicesImg from '../assets/images/hero_hostel_devices_1794744350651.jpg';

export const HERO_VISUAL_CONFIG = {
  imageUrl: heroHostelDevicesImg,
  alt: 'PGDesk digital hostel register running on a laptop and smartphone on a hostel desk',
} as const;

/**
 * CENTRALIZED PRODUCT DEMO VIDEO CONFIGURATION
 * --------------------------------------------
 * To publish your real product advertisement / walkthrough video later,
 * replace `videoUrl` below with:
 *   - A hosted MP4 URL (e.g., "https://cdn.example.com/pgdesk-demo.mp4" or "/videos/pgdesk-demo.mp4"), OR
 *   - A YouTube link (e.g., "https://www.youtube.com/watch?v=YOUR_VIDEO_ID"), OR
 *   - A Vimeo link (e.g., "https://vimeo.com/YOUR_VIDEO_ID")
 *
 * Leave `videoUrl: ''` to display the thumbnail + interactive walkthrough fallback without modifying the page component.
 */
export const DEMO_VIDEO_CONFIG = {
  videoUrl: '', // PLACEHOLDER: Add your real demo/advertisement video URL here
  thumbnailUrl: demoVideoThumbnailImg,
  thumbnailAlt: 'Hostel owner checking room occupancy and student rent records on PGDesk using laptop and mobile',
  heading: 'See How PGDesk Works',
  subtitle: 'See how easy hostel management can be.',
  explanation:
    'Watch how easy it is to add your rooms, save student details, and check who has paid rent for the month.',
} as const;

export const SUPPORT_CONTACT_CONFIG = {
  email: (import.meta.env.VITE_SUPPORT_EMAIL || '').trim(),
  phone: (import.meta.env.VITE_SUPPORT_PHONE || '').trim(),
} as const;
