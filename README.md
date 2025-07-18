# Autoclip Lite by FugiTech

As part of shutting down Autoclip I am releasing most of its code as a completely working standalone project, to hopefully tide over technically-minded users. As a reminder, I am shutting down Autoclip because it does not meet my quality standards, and likewise this codebase (which has not been updated or significantly modified from the production code) is something I'd consider sub-par. Please do not judge me for the quality of the code, nor take the code here as good examples to learn from.

**This codebase is provided as-is and I will not offer any support to those looking to use or modify it. I am not liable for anything that happens to you or your property from downloading or running this code.**

This is all functionality of the production code for Autoclip with the following pieces removed:

- Google login, since if you're running it then you're the only user
- Stripe payments, since paywalls don't make sense

## Running the codebase

0. Know the basics of how to use a terminal. If you've never run code in a terminal before, please find another tool. I will not help you.
1. Install `node`, `npm` and `ffmpeg`
2. Download/Clone this codebase to your computer
3. Run `npm install`
4. Sign up for a Twitch developer account at https://dev.twitch.tv/
5. Create an application and get a Client ID and Client Secret
6. Open `.env` and fill out the client ID and secret you got previously
7. Run `npm run dev` to start a development server. Since you're just running this for yourself that should be good enough.
8. It'll give you a URL to open, likely http://localhost:4321 - open that to use Autoclip Lite
