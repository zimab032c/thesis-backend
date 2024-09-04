// server.js
import express from "express";
import cors from "cors";
import OpenAI from "openai";
import dotenv from "dotenv";

import fs from "fs"; // Import the filesystem module
import { group } from "console";

// Function to log conversation
function logConversation(userId, role, message, group, sessionStart = false, sessionEnd = false) {
  let logEntry = '';

  // Add session start marker if it's the beginning of a new session
  if (sessionStart) {
    logEntry += `\n------------------------------\n`;
    logEntry += `Session Start: ${userId} (Group: ${group}) - ${new Date().toISOString()}\n`;
    logEntry += `------------------------------\n`;
  }

  // Add the regular log entry
  logEntry += `${new Date().toISOString()} - ${userId} - ${group} - ${role}: ${message}\n`;

  // Add session end marker if it's the end of the session
  if (sessionEnd) {
    logEntry += `\n------------------------------\n`;
    logEntry += `Session End: ${userId} - ${new Date().toISOString()}\n`;
    logEntry += `------------------------------\n`;
  }

  // Append the log entry to the "conversation_logs_experiment.txt" file
  fs.appendFile("conversation_logs_experiment.txt", logEntry, (err) => {
    if (err) {
      console.error("Failed to log conversation:", err);
    }
  });
}



// Load environment variables from .env file
dotenv.config();

const app = express();
const port = 3000;

app.use(cors());
app.use(express.json());

// Initialize OpenAI API Client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY, // Use the API key from environment variables
});

// Define mock data for orders
const orders = [
  {
    id: "A",
    product: "Product X",
    status: "In transit",
    estimatedDelivery: "2024-07-25",
  },
  {
    id: "B",
    product: "Product Y",
    status: "Processing",
    estimatedDelivery: "2024-07-30",
  },
  { id: "C", product: "Product Z", status: "Delivered", date: "2024-07-20" },
];

// Cache to store consistent responses
const responseCache = {};

const currentDate = new Date().toDateString(); // e.g., "Wed Aug 25 2023"

// Generate the initial prompt
const generateInitialPrompt = () => `
You are a virtual assistant chatbot helping customers with their recent orders. Start by introducing yourself and explaining your capabilities. Here's how you should begin the interaction:

1. **Introduction:**
- Welcome! I’m your virtual assistant, here to help you with your recent orders. I can assist you with tracking orders, modifying or canceling them and handling returns. While I'm equipped to handle these tasks efficiently, please keep in mind that my expertise is focused on these areas. If you ask me about topics outside of these functions, I might struggle to provide accurate or useful responses. However, if necessary, I can escalate your issue to a human support specialist.
- Follow up with: "You can communicate with me using the buttons or type out our requests in the input field below. Go ahead, try it."

2. **Pause for User Confirmation:**
   - Wait for a response from the user like "OK" or "Understood" before continuing.
   - Once the user confirms, ask them to provide their customer number to proceed.

**IMPORTANT:** For each order, guide the customer through the available operations using natural language. End the response with the options list. Use the format: "Options: Option1, Option2, Option3". Do not include "Options" elsewhere in the response.

**Operation Guidelines:**

1. **Track Operation:**
   - Provide the current status and relevant delivery information every time it is requested, even if the user has requested it before.
   - Indicate that the option has been selected before by marking it as "Previously Selected," but keep it fully functional.
   - For context: Today is 30.08.2024
   - Always provide specific dates based on the current date, and avoid placeholders like "[Insert delivery date here]".
   - Format dates in a conversational way, such as "August 27th, 2024" or "the 27th of August, 2024" instead of "27.08.2024".
   - If an order is in transit, realistically estimate the delivery date a few days from todays date.
   - If an order has been delivered, state the delivery date relative to the current date (e.g., "Delivered 3 days ago on [date]").
   - If an order is in processing provide, also realistically estimate the delivery date to be longer than order that are already in transit. 
   - Ask something like "What would you like to do next?" or a variation of it before listing options.
   - Avoid phrases like "Great Choice!" and instead keep responses neutral and informative.
   - Options: "Options: Track (Previously Selected if applicable), Modify, Cancel, Return, Back to Order Selection".

2. **Modify Operation:**
   - Transition to a new state when "Modify" is selected and always provide the modification options available for the order.
   - **Order A (In transit):** Allow "Modify Delivery Address". Display "Add Gift Message" as disabled and explain why it's unavailable.
   - **Order B (Processing):** Offer both "Modify Delivery Address" and "Add Gift Message".
   - **Order C (Delivered):** Explain that modifications are not possible; display both options as disabled.
   - After a user interacts with "Modify," indicate that it has been selected before by marking it as "Previously Selected," but keep it fully functional.
   - Always allow modifying actions to be repeated and executed fully whenever requested.
   - Avoid redundant process announcements like "I will now update..." as the visual pill messages already convey these actions.
   - Use: "Options: Modify Delivery Address, Add Gift Message (disabled if unavailable), Back to Order Operations, Back to Order Selection".

3. **Cancel Operation:**
   - If processing, confirm cancellation **by asking for the product number**.
   - If in-transit or delivered, inform the user it cannot be canceled and why.
   - After a user interacts with "Cancel," indicate that it has been selected before by marking it as "Previously Selected," but keep it fully functional.
   - Ensure "Cancel" is always selectable; communicate if the operation is unavailable due to order status.
   - Conclude with: "Would you like to do something else?" or a variation, then "Options: Track, Modify, Cancel (Previously Selected if applicable), Return, Back to Order Selection".

4. **Return Operation:**
   - For delivered orders, provide return instructions.
   - **For Order C**: Inform the custumer that seemingly an error occured during the generation of the return label. Inform the user that this issue occured because of an error on the shipment providers side. Example response: "It seems there was an issue generating the return label for this order due to a temporary system error from our external shipment provider. But don't worry, in such cases I am able to escalate this issue to one of our human support representatives, who will handle it as soon as possible. Would you like to resolve this issue right now with a human representative?"
   - In the case of the escalation scenario for Order C, include the option "Contact Human Representative" in the options array, in addition to the usual options.
   - After a user interacts with "Return," indicate that it has been selected before by marking it as "Previously Selected," but keep it fully functional.
   - After initiating a return, say: "What would you like to do next?" followed by "Options: Back to Order Operations, Back to Order Selection".

**Visual Indicators:**

- **Previously Selected:** Use this to indicate that an option has already been interacted with. Options that are marked as "Previously Selected" should still be fully available to the user and perform their respective actions. The status is purely a visual indicator that the user has recently interacted with this option. When users choose to interact with a "Previously Selected" option again, you should acknowledge the prior interaction and then fully execute the selected action as normal, without any limitations on repeated interactions.
- **Disabled:** Use this to indicate that an option is unavailable due to order status. It should still be visible but not selectable.

**Response Variations:**

To keep the conversation engaging and natural, **randomly choose** one of the following phrases to conclude each response before listing the options:

- "Would you like to do something else?"
- "Is there anything else you'd like to do?"
- "What would you like to do next?"
- "How can I assist you further?"
- "Would you like to explore another option?"

Ensure that each response includes any necessary information or status updates before listing options. Start by asking which order they would like to manage with "Options: Order A, Order B, Order C".

`;

async function sendIntroductionMessage() {
  const introductionMessage = [
    { role: "system", content: generateInitialPrompt() },
    { role: "user", content: "Start" }, // Triggering message for the introduction
  ];

  try {
    const chatCompletion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: introductionMessage,
      max_tokens: 200,
      temperature: 0.0,
    });

    const reply = chatCompletion.choices[0].message.content;
    return reply;
  } catch (error) {
    console.error(
      "Error generating introduction:",
      error.response ? error.response.data : error.message
    );
    return "Sorry, there was an error generating the introduction message.";
  }
}

let userSessions = {};

app.post("/api/chat", async (req, res) => {
  const userMessage = req.body.message;
  const userId = req.body.userId || "default"; // Use a unique identifier for each user session

  // Initialize user session if it doesn't exist
  if (!userSessions[userId]) {
    const group = "experiment"; 
    const introduction = await sendIntroductionMessage();
    userSessions[userId] = {
      conversationHistory: [
        { role: "system", content: generateInitialPrompt() },
        { role: "assistant", content: introduction },
      ],
      interactions: {
        A: [],
        B: [],
        C: [],
      },
      selectedOrder: null,
      waitingForConfirmation: true, // Add this to track if we're waiting for the user's OK
      customerNumber: null, // Track the customer number state
      userName: "Ilia", // Default name, can be customized later
      group: group, // Store the assigned group as experiment

    };

    // Log initial bot message
    logConversation(userId, "assistant", introduction, group, true);

    // Send the initial introduction message
    return res.json({ reply: introduction, options: ["OK", "Understood"] });
  }

  const userSession = userSessions[userId];
  // Log user message
  logConversation(userId, "user", userMessage, userSession.group);
  userSession.conversationHistory.push({ role: "user", content: userMessage });

  // Handle initial confirmation
  if (userSession.waitingForConfirmation) {
    // After user confirms understanding, ask for customer number
    userSession.waitingForConfirmation = false;
    const reply =
      "Thanks for confirming! Whenever you’re ready, please provide your customer number to proceed.";

    // Store this message as the latest relevant bot message
    userSession.lastBotMessage = reply;

    // Log bot response
    logConversation(userId, "assistant", reply, userSession.group);

    return res.json({
      reply,
      showProgressBar: false, // No progress bar needed for this response
    });
  }

  // Handle customer number input
  if (!userSession.customerNumber) {
    if (/123-456/.test(userMessage)) {
      userSession.customerNumber = userMessage; // Accept the correct customer number
      const reply = `Welcome, ${userSession.userName}! I'm ready to assist you with your orders. Which one would you like to manage?`;

      // Log the bot response
      logConversation(userId, "assistant", reply, userSession.group);

      return res.json({
        reply,
        options: ["Order A", "Order B", "Order C"],
        showProgressBar: true, // Show progress bar for this interaction
      });
    } else {
      const reply = `It seems like the customer number you entered is incorrect. You can find your customer number in the confirmation E-Mail from your last purchase with us (Briefing Sheet).`;

      // Log the bot response
      logConversation(userId, "assistant", reply, userSession.group);

      return res.json({
        reply,
        options: [],
        showProgressBar: true, // No progress bar for this interaction
      });
    }
  }

  // Handle order selection and navigation
  if (!userSession.selectedOrder) {
    const normalizedUserMessage = userMessage.toLowerCase().trim();

    // Define regex patterns for each order
    const orderPatterns = orders.map((order) => {
      return {
        id: order.id,
        regex: new RegExp(
          `\\b(order\\s*${order.id.toLowerCase()}|${order.id.toLowerCase()})\\b`,
          "i"
        ),
      };
    });

    // Find the order that matches the user's input
    const selectedOrder = orderPatterns.find((order) =>
      order.regex.test(normalizedUserMessage)
    );

    if (selectedOrder) {
      userSession.selectedOrder = selectedOrder;
      const reply = `Got it! You've selected Order ${selectedOrder.id}. How can I assist you with this order?`;

      // Log the bot response
      logConversation(userId, "assistant", reply, userSession.group);

      return res.json({
        reply,
        options: [
          "Track",
          "Modify",
          "Cancel",
          "Return",
          "Back to Order Selection",
        ],
        showProgressBar: false,
      });
    } else {
      const reply = "Please select an order to manage.";

      // Log the bot response
      logConversation(userId, "assistant", reply, userSession.group);

      return res.json({
        reply,
        options: ["Order A", "Order B", "Order C"],
        showProgressBar: false,
      });
    }
  } else if (userMessage.includes("Back to Order Selection")) {
    userSession.selectedOrder = null;
    const reply = "Sure! Which order can I help you with?";

    // Log the bot response
    logConversation(userId, "assistant", reply, userSession.group);

    return res.json({
      reply,
      options: ["Order A", "Order B", "Order C"],
      showProgressBar: false,
    });
  }

  // Handle "Track" operation
  const currentOrderId = userSession.selectedOrder.id;
  // if (userMessage.includes("Track")) {
  //   // Provide order tracking information
  //   const order = userSession.selectedOrder;
  //   const orderDetails = `Order ${order.id} (${order.product}) is currently ${order.status}.`;

  //   return res.json({
  //     reply: `Tracking information for ${orderDetails}`,
  //     options: ["Modify", "Cancel", "Return", "Back to Order Selection"],
  //     showProgressBar: true, // Show progress bar for tracking
  //   });
  // }

  // Track interactions for "Previously Selected"
  const currentOrderInteractions = userSession.interactions[currentOrderId];
  if (!currentOrderInteractions.includes(userMessage)) {
    currentOrderInteractions.push(userMessage);
  }

  // Check if the response for this exact conversation state is cached
  const cacheKey = JSON.stringify(userSession.conversationHistory);
  if (responseCache[cacheKey]) {
    console.log(`Using cached response for ${userId}`);
    return res.json({
      reply: responseCache[cacheKey],
      options: cacheOptionsWithPreviouslySelected(
        responseCache[cacheKey],
        currentOrderInteractions
      ),
      showProgressBar: false,
    });
  }

  try {
    const chatCompletion = await openai.chat.completions.create({
      model: "gpt-4o-mini", // or "gpt-4" if you have access
      messages: userSession.conversationHistory,
      max_tokens: 150,
      temperature: 0.5, // Lower temperature for deterministic output
    });

    const reply = chatCompletion.choices[0].message.content;
    userSession.conversationHistory.push({ role: "assistant", content: reply });

    // Log bot response
    logConversation(userId, "assistant", reply, userSession.group);

    // Cache the response
    responseCache[cacheKey] = reply;

    // Extract options for button display
    let options = extractOptionsFromResponse(reply);
    options = cacheOptionsWithPreviouslySelected(
      options,
      currentOrderInteractions
    );

    console.log(`Reply to ${userId}: ${reply}`);
    res.json({
      reply,
      options,
      showProgressBar: false, // No progress bar by default for AI-generated responses
    });
  } catch (error) {
    console.error(
      "Error:",
      error.response ? error.response.data : error.message
    );
    res.status(500).send("Error processing the request");
  }
});

app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});

// Function to extract options from the AI response
function extractOptionsFromResponse(reply) {
  const match = reply.match(/Options:\s*([^\n\r]+)/i);
  if (match) {
    // Split the matched options by comma, trim each option, and remove unwanted punctuation
    return match[1]
      .split(",")
      .map((option) => option.trim()) // Trim whitespace
      .map((option) => option.replace(/[,.]$/, "")); // Remove trailing comma or period
  }
  return [];
}

// Function to mark options as "Previously Selected" based on past interactions
function cacheOptionsWithPreviouslySelected(options, interactions) {
  const nonGrayedOptions = [
    "Order A",
    "Order B",
    "Order C",
    "Back to Order Operations",
    "Back to Order Selection",
  ];

  return options.map((option) => {
    if (
      interactions.includes(option) &&
      !option.includes("(Previously Selected)") &&
      !nonGrayedOptions.includes(option)
    ) {
      return `${option} (Previously Selected)`;
    }
    return option;
  });
}
