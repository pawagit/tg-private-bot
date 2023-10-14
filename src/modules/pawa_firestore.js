const collectionNameUsers = process.env.FIRESTORE_COLLECTION_NAME_USERS;
const collectionNameData = process.env.FIRESTORE_COLLECTION_NAME_DATA;

// Initialise Firestore
const Firestore = require('@google-cloud/firestore');

const db = new Firestore({
  projectId: process.env.FIRESTORE_PROJECT_ID,
  keyFilename: process.env.FIRESTORE_KEY_FILENAME,
});



/**
 * Get a user by its id
 * @param {String} userId 
 * @returns 
 */
async function getUser(userId) {
  userId = String(userId);
  const docRef = db.collection(collectionNameUsers).doc(userId);
  
  try {
    const docSnapshot = await docRef.get();

    if (docSnapshot.exists) {
      // Document exists, we can access its data using .data()
      const userData = docSnapshot.data();
      return userData;
    } else {
      // Document does not exist
      console.log("User document does not exist.");
      return null;
    }
  } catch (error) {
    console.error("Error retrieving user document:", error);
    throw error;
  }
}


async function createUser(userId, userData) {
  userId = String(userId);
  const docRef = db.collection(collectionNameUsers).doc(userId);

  try {
    // Check if the user already exists
    const existingUser = await docRef.get();

    if (existingUser.exists) {
      // User already exists, you may choose to handle this case differently
      //console.log("User document already exists.");
      return null;
    } else {
      // Create a new user document
      await docRef.set(userData);

      // Return the newly created user data
      return userData;
    }
  } catch (error) {
    console.error("Error creating user document:", error);
    throw error;
  }
}


async function updateUser(userId, userData) {
  userId = String(userId);
  const docRef = db.collection(collectionNameUsers).doc(userId);

  try {
    // Check if the user already exists
    const existingUser = await docRef.get();

    if (existingUser.exists) {
      // Update the user document
      await docRef.update(userData);

      // Return the updated user data
      return { ...existingUser.data(), ...userData };
    } else {
      // User does not exist, you may choose to handle this case differently
      //console.log("User document does not exist.");
      return null;
    }
  } catch (error) {
    console.error("Error updating user document:", error);
    throw error;
  }
}


module.exports = {
  getUser,
  createUser,
  updateUser,
};