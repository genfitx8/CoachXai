<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# CoachXai: AI coach agent service for every coach and student

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/drive/13GzuTDTTZ6zf_mCdHkHCpE7fPpABTSth

## Run Locally

**Prerequisites:** Node.js

1. Install dependencies:
   `npm install`
2. Create a `.env` file in the root directory and set the following:

   ```
   GEMINI_API_KEY=your_gemini_api_key_here

   # Firebase Configuration (Optional)
   # If not set, the app will use local storage mode
   VITE_FIREBASE_API_KEY=your_firebase_api_key
   VITE_FIREBASE_AUTH_DOMAIN=your_project_id.firebaseapp.com
   VITE_FIREBASE_PROJECT_ID=your_project_id
   VITE_FIREBASE_STORAGE_BUCKET=your_project_id.appspot.com
   VITE_FIREBASE_MESSAGING_SENDER_ID=your_messaging_sender_id
   VITE_FIREBASE_APP_ID=your_app_id
   ```

3. Run the app:
   `npm run dev`

**Note:** If Firebase configuration is not provided or initialization fails, the app will automatically use local storage mode.
