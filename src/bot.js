/**
 * ****************************************************************************
 * tg-telegraf-privatebot Barebone
 * ****************************************************************************
 * 
 * ****************************************************************************
 * 
 * Date:        2023-10-14
 * Version:     0.1
 * Author:      pawagit
 * 
 * ****************************************************************************
 * 
 * Google Cloud Run Deployment:
 *  - Build a new revision: 
 *    gcloud builds submit --config cloudbuild.yaml .
 *  - Deploy a new revision:
 *    https://console.cloud.google.com/run/
 * 
 * ****************************************************************************
 *  Local Development: Public domain for webhook using ngrok:
 *  - ngrok for dev webhook url:
 *    - cd C:\ngrok
 *    - start ngrok: ngrok http 49189
 *    - update const WEBHOOKURL_DEV with the new url
 * 
 * ****************************************************************************
 * 
 * Changelog:
 *  - Initial version
 */




/**
 * Dependencies
 */
// External npm modules
require('dotenv').config(); // Load the environment variables
const { Telegraf, Markup, session, Context } = require('telegraf'); // npm install telegraf
const { message } = require('telegraf/filters');

// Custom Firestore module for managing the app data
const store = require('./modules/pawa_firestore');


const IS_DEV = true;

/**
 * Global Variables
 */
const token = (IS_DEV) ? process.env.BOT_TOKEN_DEV : process.env.BOT_TOKEN; // Telegram Bot Token
const adminUserId = process.env.TG_ADMIN_USER_ID; // Admin user to which admin messages are sent
const port = (IS_DEV) ? process.env.PORT_DEV : process.env.PORT || 8080;
const webhookUrl = (IS_DEV) ? process.env.WEBHOOKURL_DEV : process.env.WEBHOOKURL;


/**
 * Initialise the bot that uses the session extension
 *  → Session requires webhookReply to be disabled:
 *  https://github.com/feathers-studio/telegraf-docs/blob/b694bcc36b4f71fb1cd650a345c2009ab4d2a2a5/guide/session.md
 */
const bot = new Telegraf(token, { telegram: { webhookReply: false } });




/** *******************************************************************************
 *  BOT MIDDLEWARE
 *  **************************************************************************** */

/**
 * Session
 * → Use the session extension
 */
bot.use(session({ defaultSession: () => ({ 
  isAdmin: false,
  nextInput: '', 
  fileId: '' 
}) }));


/**
 * isAdmin
 *  → Middleware to check if the message is from the admin
 */
bot.use((ctx, next) => {
  const user = ctx.from;
  const userId = user.id;
  //const message = ctx.message;
  console.log('Message received from: ',JSON.stringify(user,null,2))
  
  if (isAdmin(userId)) {
    // Message is from the admin. Set the seesion flag //and proceed to the next middleware
    ctx.session.isAdmin = true;
    //return next();
  } else {
    // Message is not from the the admin
    console.log('Received a message from a non-admin user.');
    //return Promise.resolve(); // Ignore it instead of proceeding to next
  }
  return next();
});


/**
 * Known User
 *  → Middleware to check if the user is known
 */
bot.use( async (ctx, next) => {
  try {
    const user = ctx.from;
    const userId = user.id;

    // Retrive the user data from Firestore
    const firestoreUser = await store.getUser(userId);
    //console.log('existing firestore user: ',firestoreUser);

    if (isAdmin(userId) && (!firestoreUser || firestoreUser.status !== 'registered' || !firestoreUser.isAdmin)) {
      // This is an admin that is not yet registered. Register it
      const newUser = toFirestoreUserObject(user);
      newUser.status = 'registered';
      newUser.isAdmin = true;
      const createdUser = await store.createUser(userId,newUser);
      console.log('firestore admin user created: ',createdUser);
      await ctx.reply('Hello Admin! You are now registered and can use this bot!')
      return Promise.resolve();
    }
  
    if (firestoreUser) {
      console.log('existing firestore user: ',firestoreUser);

      // User is known, check the user status
      const status = firestoreUser.status;

      // Skip this step for admins
      if (ctx.session.isAdmin) {
        return next(); //proceed to the next middleware
      }

      switch (status) {
        case 'registered':
          return next(); //proceed to the next middleware
        case 'new':
          ctx.reply('Your request is still pending. Please await approval');
          return Promise.resolve();
        case 'rejected':
          console.warn('Rejected user is still using this bot!')
          return Promise.resolve();
        default:
          return Promise.resolve();
      }

    } else {
      return registerNewUser(ctx,userId,user);
    }
  } catch(e) {
    console.error(e.message,e.stack)
    console.log(JSON.stringify(ctx))
  }
});


/**
 * Helper function for handling the registration of a new User
 * @param {TelegramContext} ctx 
 * @param {String} userId 
 * @param {TelegramUser} user 
 * @returns 
 */
async function registerNewUser(ctx,userId,user) {
  // User is not known. Create a new user in Firestore
  const newUser = toFirestoreUserObject(user);
  const createdUser = await store.createUser(userId,newUser);
  console.log('firestore user created: ',createdUser)

  //Send 'no access' message to user
  let msg = 'Sorry, you are not authorized to use this bot.';
  let options = {
    reply_markup: {"inline_keyboard": [[{text: 'Request Access', callback_data: `requestAccess|${userId}`}]]},
  }
  await ctx.reply(msg, options);

  // Send 'approve/reject' message to bot admin with a allow/reject inline keyboard
  msg = `Unknown user with ID ${userId} tried to access the bot. Allow or reject them? \n${JSON.stringify(user,null,2)}`;
  //console.warn(msg);

  options = Markup.inlineKeyboard([
    Markup.button.callback('Allow', `allow|${userId}`),
    Markup.button.callback('Reject', `reject|${userId}`),
  ]);
  await ctx.telegram.sendMessage(adminUserId, msg, options);

  // Terminate request by returning a resolved promise
  return Promise.resolve(); 
}


/** *******************************************************************************
 *  CALLBACK QUERY HANDLERS
 *  **************************************************************************** */

/**
 * Callback Query 'requestAccess|{userId}
 *  → Handles the access request callback query.
 *  - Sends a allow/reject message to the admin for a new, not yet existing user.
 *  - If a request is still pending, a 'be patient' message is sent to the user.
 */
const accessRequestPattern = /^requestAccess\|(.+)$/;
bot.action(accessRequestPattern, async (ctx) => {
  const user = ctx.from;
  const userId = user.id;

  // Check if a request is already pending for this user
  const firestoreUser = await store.getUser(userId);

  if (firestoreUser && firestoreUser.status == "new") {
    ctx.telegram.sendMessage(userId,`Your request is still pending! \nPlease be patient.`);
    return;
  } else if (firestoreUser) {
    // Skip all actions for exsting - non-new users
    return;
  }

  // Prepare the request message to the admin
  const msg = `Hello Admin! \nI want to use your bot! Please allow me to use it. \n\nMy User Details: \n${JSON.stringify(user,null,2)}`;
  const options = Markup.inlineKeyboard([
    Markup.button.callback('Allow', `allow|${userId}`),
    Markup.button.callback('Reject', `reject|${userId}`),
  ]);
  ctx.telegram.sendMessage(adminUserId, msg, options);

  // Prepare the message to the user
  ctx.telegram.sendMessage(userId,`Your request is sent to the admins for approval. \nPlease await their response. \nThey usually respond within 24 hours.`);
  
  // Answer the callback query
  ctx.answerCbQuery('Request sent! We will get back to you.')
});


/**
 * Admin Callback Query 'allow||reject|{userId}'
 *  → Handles the admin callback query for allowing or rejecting a new user.
 *  - Updates the user's status in Firestore depending on the decision.
 *  - Informs the user about allowance or rejection
 *  - Confirms the actions taken to the admin
 */
const allowOrRejectUserPattern = /^(allow|reject)\|(.+)$/;
bot.action(allowOrRejectUserPattern, async (ctx) => {
  //console.warn('match:',ctx.match);

  // Extract the action and userId from the matched pattern
  const action = ctx.match[1];
  const allow = (action === 'allow') ? true : false;
  const userId = ctx.match[2];

  // Change the status of the user to 'registered' and update it in Firestore
  const userData = { status: (allow) ? 'registered' : 'rejected' };
  const updatedUser = await store.updateUser(userId,userData);

  // Inform the user
  let msg = (allow) 
    ? 'Acces is granted! You can now play with me!'
    : 'Acces is rejected! You cannot use this bot. Sorry mate.';
  await ctx.telegram.sendMessage(userId,msg);

  // Inform the admin
  msg = (allow) 
    ? `User is now approved. User Details: \n${JSON.stringify(updatedUser,null,2)}`
    : `User is now rejected and will be blocked in the future. User Details: \n${JSON.stringify(updatedUser,null,2)}`
  await ctx.telegram.sendMessage(adminUserId,msg);

  // Send an immediate answer to the callback query
  await ctx.answerCbQuery('All done. Have a nice one!')
});



/** *******************************************************************************
 *  BOT MESSAGE HANDLERS
 *  **************************************************************************** */

/**
 * Handle Text Messages
 * 
 */
bot.on(message('text'), async (ctx) => {
  ctx.reply('👋')
});



/** *******************************************************************************
 *  LAUNCH BOT
 *  **************************************************************************** */
/**
 * Launch the bot
 */
//Start the bot
bot.launch({
  webhook: {
    domain: webhookUrl,
    port: port
  }
});
console.log(`Bot is listening for updates at ${webhookUrl} on port ${port}`);



// Dummy express server for first deployment in GCR.
// → Remember to install/uninstall express and un/comment the bot.launch() section
// → npm uninstall express
/* const express = require('express'); 
const app = express();
// Start the Express server
app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
}); */





/** *******************************************************************************
 *  HELPER FUNCTIONS
 *  **************************************************************************** */

/**
 * Checks if the user given by its userId is an admin or not
 * @param {*} userId Telegram userId
 * @returns {Bool} true/false
 */
const isAdmin = (userId) => { return String(userId) === String(adminUserId) };


/**
 * Converts a telegram user into a Firestore user 
 * with default values for createdAt = now() and status = new
 * Is used during the creation of a new user in Firestore
 * @param {*} tgUser Telegram user object (e.g. ctx.from)
 * @returns The Firestore user object
 */
const toFirestoreUserObject = (tgUser) => {
  const now = new Date().toJSON();
  const user = {
    userId: tgUser.id,
    username: tgUser.username || '',
    first_name: tgUser.first_name,
    last_name: tgUser.last_name || '',
    full_name:  `${tgUser.first_name || ''} ${tgUser.last_name || ''}`.trim(),
    createdAt: now,
    status: "new",
    statusSetAt: now,
  }
  return user;
}
