# Awaaz — AI-Powered Voice-First Language Learning

**Awaaz** is an **AI-powered, oral-first language learning tool** built for people who may not be fully literate in either their native language or the language they are learning. It is designed to support refugees and newcomers who rely primarily on spoken communication rather than reading or writing.

Developed for the **AI & Data Science for Good Hackathon**, Awaaz was created in collaboration with **Reception House Waterloo Region**, the **Future of Work Institute**, and **MCIS Language Solutions**, with support from **Waterloo.AI** and **UWDSC**.

Awaaz focuses on helping users build practical language skills through **listening, speaking, repetition, and scenario-based interaction** rather than text-heavy lessons.

---

## Team Members

- **Shanté P.**
- **Dania L.**
- **Weiqi X.**
- **Alex V.**
- **Lino K.**

---

## Executive Summary

Awaaz addresses a critical gap in accessible education for refugees and newcomers who rely primarily on spoken language rather than reading or writing.

The project responds to three major systemic challenges:

### The Waitlist Crisis

In the **Waterloo Region**, newcomers often wait over a year to access traditional English as a Second Language (ESL) programs. This long delay creates a period of “dead time” during the first year of resettlement, when support is most needed but least available.

### The Literacy Gap

Most ESL programs assume learners can read and write. For non-literate learners, including many within the **Rohingya refugee community**, this creates a major barrier. These learners rely primarily on oral communication, making traditional curriculum difficult to access.

### The Daily Impact

Without immediate and accessible tools, newcomers struggle to build the listening and speaking skills needed for everyday life, such as navigating healthcare systems, communicating at work, shopping for food, or handling essential tasks independently.

---

## Our Approach

Awaaz is an **oral-first, AI-powered learning tool** designed to support spoken English development through accessible, voice-based interaction.

At the center of the experience is a friendly **blob-shaped AI tutor** that guides users through the platform. By clicking the character, users can begin interactive role-play scenarios based on real-life situations.

These modules focus on practical, high-impact interactions, including:

- **Workplace Communication** — Practicing conversations with a manager about shifts, job opportunities, and work expectations
- **Healthcare Navigation** — Simulating a doctor’s appointment and communicating symptoms
- **Grocery Shopping** — Learning how to identify halal products and avoid non-halal products
- **Open-Ended Learning** — Asking the AI tutor about situations or questions from daily life

By focusing on **listening and speaking first**, Awaaz helps newcomers start building practical language skills immediately, without requiring literacy as a starting point.

---

## Target Audience

The primary users of Awaaz are refugees and newcomers with limited literacy skills who face significant barriers to traditional, text-based ESL programs.

We specifically focus on:

### Non-Literate Learners

Individuals who rely primarily on spoken language rather than reading or writing.

### Women Caregivers

Newcomers managing household and childcare responsibilities who require flexible, audio-driven modules that can fit into limited free time.

### Employment Seekers

Individuals focused on early employment readiness who need to build foundational spoken English for entry-level roles and workplace communication.

### Rohingya Community Members

Users from communities where oral communication is central and where text-based educational tools may be inaccessible or ineffective.

---

## Cultural Sensitivity and Design Rationale

To ensure the tool is respectful, realistic, and intuitive, Awaaz follows several core design principles:

### Oral-First Navigation

The app uses **zero-text or minimal-text navigation**, relying instead on audio prompts, simple visual icons, and intuitive interaction patterns.

### Appropriate Imagery

Visual cues and prompts are designed to be culturally relevant and inclusive, reflecting the common challenges faced by Rohingya and newcomer communities.

### Common Daily Scenarios

Modules are based on situations users are likely to encounter regularly, such as visiting a doctor, grocery shopping, communicating with employers, and asking for help.

### Meaning Behind the Name

The name **Awaaz** means **“Voice.”** This is a deliberate choice that shifts the focus from “limited literacy” to **vocal strength, dignity, and empowerment**.

### Patience-First Interaction

The system is designed for slow response times and long pauses, allowing learners the “think time” needed to process spoken prompts. Feedback emphasizes clarity, repetition, and encouragement rather than punishment or error-heavy correction.

---

## Core Features

- **Voice-first interface**
- **AI-powered speech-to-speech translation**
- **Minimal-text, accessibility-centered design**
- **Animated blob tutor for guidance**
- **Scenario-based spoken language practice**
- **Practical, real-world communication exercises**
- **User progress and session tracking**
- **Low-friction interaction for low-literacy learners**

---

## Technical Architecture

Awaaz uses a speech-to-speech pipeline that converts spoken input into translated spoken output.

### Speech-to-Speech Pipeline

1. The browser captures the user’s speech through the microphone
2. Audio is streamed to the Node.js backend
3. The backend transcribes the speech using **Google Speech-to-Text**
4. The transcript is translated using **Google Translation**
5. The translated text is synthesized into audio using **Google Text-to-Speech**
6. The translated audio is streamed back to the frontend for immediate playback

This full round-trip is designed to happen in under **3 seconds**.

---

## App Design Explanation

### The Tech Stack, Simply Put

Three things happen as soon as a user speaks:

- their voice is transcribed using **Google Speech-to-Text**
- the words are translated using **Google Translation**
- a spoken response is generated using **Google Text-to-Speech**

This creates a fast and accessible learning loop centered around oral communication.

### The Blob Character

Instead of using written instructions or text-heavy error messages, the app communicates through oral prompts and visual feedback.

The blob character:

- pulses when listening
- moves its mouth when speaking
- uses sound and animation to communicate success, waiting, or failure states

This prevents users from encountering a wall of confusing text and keeps the experience intuitive and supportive.

### Parallel Team Development

The team split development into three major tracks with clean separation:

- **Frontend and UX** — animated character, visual experience, accessibility-first interaction
- **Backend Pipeline** — speech-to-speech processing and Google API orchestration
- **Data, Infrastructure, and Testing** — database, auth, routes, deployment, and test coverage

A shared contract allowed all contributors to work in parallel.

---

## Modules Breakdown

### Workplace Communication

Supports conversations about job opportunities, shift schedules, availability, and basic interview-style questions.

### Healthcare Navigation

Helps users practice describing symptoms, responding to questions, and understanding interactions with healthcare professionals.

### Grocery Shopping

Uses visual cues to help learners identify halal products and avoid non-halal food items.

### Open-Ended Learning

Supports everyday dialogue and confidence-building through flexible, open conversation with the AI tutor.

---

## Ethical Considerations

### Informed Consent

- The blob tutor explains the purpose of the app and how user data is used
- Instead of written terms and conditions, users can receive oral and visual explanations in their native language
- Users can accept or decline through simple visual responses such as thumbs up or thumbs down

### Fairness in Access and Linguistic Equity

- Since some target users may not rely on written language, all core functions are supported through visuals and spoken guidance
- The app supports both oral and visual learning styles for broader accessibility

### Cultural Sensitivity

- The app includes support for culturally specific needs, such as identifying halal food options
- It avoids assumptions based on mainstream text-based learning models
- Scenario design aims to respect faith, community practices, and the lived realities of newcomers

---

## Future Directions

- Expand support beyond English learning into more multilingual pathways
- Conduct outreach and participatory testing with Rohingya communities
- Improve the AI teaching model through direct community feedback
- Refine scenarios through ongoing research and user observation
- Ensure future development includes meaningful human input from the communities being served

---

## Tech Stack

### Frontend
- React
- TypeScript
- Visual/audio-first interaction model

### Backend
- Node.js
- Express.js
- TypeScript
- WebSocket-based audio streaming

### Database
- MySQL

### AI / Cloud Services
- Google Speech-to-Text
- Google Translation
- Google Text-to-Speech

---

## Repository Structure

```text
ai-lang-learning-tool/
├── ai-lang-frontend/
├── ai-lang-backend/
└── README.md
