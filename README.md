# tg-private bot
## tl;dr
A Node.js Boilerplate for a Telegram Bot App that exposes its functionality only to approved users.
It leverages the Telegraf libary and uses Google Firestore for storing the persistent data. 
It is ready to be deployed on Google Cloud Run (GCR).

## Dependencies
`npm install dotenv telegraf @google-cloud/firestore`

## Notes
### ⚠️ First deployement on GCR will fail unless...
Since the domain where the app will run in GCR is not known before the first deployement, the bot will not successfully launch. You can avoid this by:
1. commenting the `bot.launch(...)` section 
2. uncommenting the the dummy express server section `const express = require('express') ...`
3. installing express as dependency using `npm install express`

→ 💡 Don't forget to revert your changes and to uninstall express once your GCR app url is known.
