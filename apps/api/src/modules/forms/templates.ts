import { QuestionType } from '@eventora/shared';

export interface FormTemplateQuestion {
  type: QuestionType;
  label: string;
  helpText?: string;
  placeholder?: string;
  required: boolean;
  options?: string[];
  validation?: Record<string, unknown>;
}

export interface FormTemplate {
  key: string;
  name: string;
  description: string;
  category: string;
  questions: FormTemplateQuestion[];
}

export const FORM_TEMPLATES: Record<string, FormTemplate> = {
  HACKATHON: {
    key: 'HACKATHON',
    name: 'Hackathon & Dev Sprint',
    description: 'Comprehensive form for team projects, repository links, tracks, and tech stacks.',
    category: 'Technical',
    questions: [
      {
        type: QuestionType.SHORT_TEXT,
        label: 'Team / Project Title',
        placeholder: 'e.g. NextGen Campus Navigator',
        helpText: 'Working title or theme of your hackathon project',
        required: true,
      },
      {
        type: QuestionType.URL,
        label: 'GitHub / Repository Link',
        placeholder: 'https://github.com/your-team/project',
        helpText: 'Public GitHub or GitLab repository for your code submission',
        required: false,
      },
      {
        type: QuestionType.LONG_TEXT,
        label: 'Project Abstract & Problem Statement',
        placeholder: 'Describe the problem you are solving and your technical approach...',
        helpText: 'Minimum 20 characters',
        required: true,
        validation: { minLength: 20 },
      },
      {
        type: QuestionType.MULTI_SELECT,
        label: 'Primary Tech Stack',
        helpText: 'Select all technologies and frameworks your team plans to use',
        required: true,
        options: [
          'React / Next.js',
          'Python / FastAPI',
          'Node.js / Express',
          'Rust / Go',
          'Mobile (Flutter / React Native)',
          'AI / ML / LLMs',
          'Web3 / Smart Contracts',
          'Cloud & DevOps',
        ],
      },
      {
        type: QuestionType.DROPDOWN,
        label: 'Hackathon Track',
        helpText: 'Choose the primary judging track for your project',
        required: true,
        options: [
          'Open Innovation',
          'AI & Data Intelligence',
          'Smart Campus & EdTech',
          'Healthcare & BioTech',
          'FinTech & Security',
          'GreenTech & Sustainability',
        ],
      },
      {
        type: QuestionType.RADIO,
        label: 'T-Shirt Size',
        helpText: 'For official event hackathon swags and jerseys',
        required: true,
        options: ['S', 'M', 'L', 'XL', 'XXL'],
      },
      {
        type: QuestionType.DROPDOWN,
        label: 'Dietary Preference',
        helpText: 'Used for meal arrangements during the 24-hour hackathon',
        required: true,
        options: ['None / Regular', 'Vegetarian', 'Vegan', 'Halal', 'Jain'],
      },
      {
        type: QuestionType.PHONE,
        label: 'Emergency Contact Phone',
        placeholder: '+91 98765 43210',
        helpText: 'Reachable phone number during overnight hackathon hours',
        required: true,
      },
      {
        type: QuestionType.FILE_UPLOAD,
        label: 'Team Resume / Pitch Deck (PDF)',
        helpText: 'Optional team profile or concept presentation',
        required: false,
        validation: { maxFileBytes: 10485760 },
      },
    ],
  },

  WORKSHOP: {
    key: 'WORKSHOP',
    name: 'Technical Workshop',
    description: 'Designed for hands-on bootcamps, masterclasses, and technical workshops.',
    category: 'Academic',
    questions: [
      {
        type: QuestionType.RADIO,
        label: 'Prior Experience Level',
        helpText: 'Helps instructors tune the lab exercises and pacing',
        required: true,
        options: [
          'Beginner (Zero prior experience)',
          'Intermediate (Some practical experience)',
          'Advanced (Proficient practitioner)',
        ],
      },
      {
        type: QuestionType.YES_NO,
        label: 'Will you bring your own laptop?',
        helpText: 'Required for hands-on coding and lab exercises',
        required: true,
      },
      {
        type: QuestionType.DROPDOWN,
        label: 'Primary Operating System',
        helpText: 'For environment setup instructions before the workshop',
        required: true,
        options: ['Windows 10 / 11', 'macOS (Apple Silicon / Intel)', 'Linux (Ubuntu / Fedora / Arch)', 'Other'],
      },
      {
        type: QuestionType.MULTI_SELECT,
        label: 'Workshop Topics of Interest',
        helpText: 'Select areas you want the instructors to focus on',
        required: false,
        options: [
          'Architecture & Fundamentals',
          'Live Hands-on Coding Lab',
          'Production Deployment & CI/CD',
          'Performance & Security Hardening',
          'Open Q&A with Mentors',
        ],
      },
      {
        type: QuestionType.LONG_TEXT,
        label: 'Questions or Expectations for the Instructor',
        placeholder: 'What do you hope to take away from this session?',
        required: false,
      },
    ],
  },

  CULTURAL: {
    key: 'CULTURAL',
    name: 'Cultural Fest & Performance',
    description: 'Tailored for dance, music, theater, arts, and onstage cultural performances.',
    category: 'Cultural',
    questions: [
      {
        type: QuestionType.DROPDOWN,
        label: 'Performance Category',
        helpText: 'Select your artistic performance category',
        required: true,
        options: [
          'Dance (Solo)',
          'Dance (Group / Crew)',
          'Music / Vocals (Solo)',
          'Music / Band (Group)',
          'Theater / Drama / Skit',
          'Standup Comedy / Spoken Word',
          'Fashion / Runway',
          'Other Art Form',
        ],
      },
      {
        type: QuestionType.NUMBER,
        label: 'Performance Duration (Minutes)',
        placeholder: '5',
        helpText: 'Duration must be between 2 and 20 minutes',
        required: true,
        validation: { minNumber: 2, maxNumber: 20 },
      },
      {
        type: QuestionType.YES_NO,
        label: 'Do you require audio track playback?',
        helpText: 'Sound engineers will coordinate track handoff before stage entry',
        required: true,
      },
      {
        type: QuestionType.LONG_TEXT,
        label: 'Stage, Microphone & Lighting Requirements',
        placeholder: 'e.g. 3 wireless handheld mics, blue mood lighting, 2 instrument DI boxes...',
        helpText: 'List any AV or stage prop assistance needed',
        required: true,
      },
      {
        type: QuestionType.LONG_TEXT,
        label: 'Names and Roll Numbers of all Co-Performers',
        placeholder: 'Include all stage performers for backstage pass issuance',
        required: false,
      },
    ],
  },

  COMPETITION: {
    key: 'COMPETITION',
    name: 'College Competition & Contests',
    description: 'Structured for tournaments, academic quizzes, coding challenges, and games.',
    category: 'Competition',
    questions: [
      {
        type: QuestionType.DROPDOWN,
        label: 'Competition Track / Sub-Event',
        helpText: 'Choose the specific contest you are entering',
        required: true,
        options: [
          'Algorithm Speed Coding',
          'UI/UX Design Sprint',
          'Tech & General Quiz Bowl',
          'Robotics Line Follower',
          'Esports Gaming Tournament',
          'Paper & Poster Presentation',
        ],
      },
      {
        type: QuestionType.RADIO,
        label: 'Participant Academic Division',
        required: true,
        options: ['Undergraduate Student', 'Postgraduate Student', 'High School Senior'],
      },
      {
        type: QuestionType.YES_NO,
        label: 'Have you participated in similar inter-college contests before?',
        required: true,
      },
      {
        type: QuestionType.URL,
        label: 'Link to Past Projects or Portfolio',
        placeholder: 'https://behance.net/profile or https://github.com/handle',
        required: false,
      },
      {
        type: QuestionType.CHECKBOX,
        label: 'I agree to the Official Rulebook, Anti-Cheating & Fair Play Policy',
        helpText: 'Violations will result in immediate disqualification and academic notice',
        required: true,
      },
    ],
  },

  SEMINAR: {
    key: 'SEMINAR',
    name: 'Seminar & Academic Conference',
    description: 'Suited for keynotes, faculty colloquia, symposiums, and research conferences.',
    category: 'Academic',
    questions: [
      {
        type: QuestionType.DROPDOWN,
        label: 'Academic / Professional Designation',
        required: true,
        options: [
          'Undergraduate Student',
          'Postgraduate / Masters Student',
          'PhD Scholar / Postdoc',
          'Faculty / Professor',
          'Industry Professional / Researcher',
          'Other',
        ],
      },
      {
        type: QuestionType.YES_NO,
        label: 'Are you presenting a research paper or lightning talk?',
        required: true,
      },
      {
        type: QuestionType.SHORT_TEXT,
        label: 'Research Paper / Talk Title (if presenting)',
        placeholder: 'Leave blank if attending as general audience',
        required: false,
      },
      {
        type: QuestionType.RADIO,
        label: 'Conference Track of Highest Interest',
        required: true,
        options: [
          'Keynote & Plenary Sessions',
          'Artificial Intelligence & Deep Learning',
          'Distributed Systems & Cyber-Physical Networks',
          'Ethics, Policy & Digital Transformation',
        ],
      },
      {
        type: QuestionType.LONG_TEXT,
        label: 'Question for Keynote Speaker',
        placeholder: 'Submit a question to be curated for the live speaker Q&A...',
        required: false,
      },
    ],
  },

  GENERAL: {
    key: 'GENERAL',
    name: 'General Campus Event',
    description: 'Standard event registration form for club meetups, orientations, and guest lectures.',
    category: 'General',
    questions: [
      {
        type: QuestionType.DROPDOWN,
        label: 'How did you hear about this event?',
        required: true,
        options: [
          'Campus Posters / Notice Board',
          'Club WhatsApp / Telegram Community',
          'Instagram / Social Media',
          'Class Representative / Faculty Announcement',
          'Friend / Peer Recommendation',
          'Other',
        ],
      },
      {
        type: QuestionType.RADIO,
        label: 'Attendance Preference',
        required: true,
        options: ['In-Person on Campus', 'Virtual / Stream Online'],
      },
      {
        type: QuestionType.YES_NO,
        label: 'Do you require special accessibility accommodations?',
        required: true,
      },
      {
        type: QuestionType.LONG_TEXT,
        label: 'Any comments, questions, or dietary notes for the hosts?',
        placeholder: 'Optional notes...',
        required: false,
      },
    ],
  },
};
