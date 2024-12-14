const express = require('express');
const expressWs = require('express-ws');
const path = require('path');
const mongoose = require('mongoose');
const session = require('express-session');
const bcrypt = require('bcrypt');

const userSchema = new mongoose.Schema({
  name: String,
  email: { type: String, unique: true },
  password: String,
});

const User = mongoose.model('User', userSchema);

const pollSchema = new mongoose.Schema({
  question: String,
  options: [
    {
      answer: String,
      votes: { type: Number, default: 0 },
    },
  ],
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
});

const Poll = mongoose.model('Poll', pollSchema);

const PORT = 3000;
//TODO: Update this URI to match your own MongoDB setup
const MONGO_URI = 'mongodb://localhost:27017/keyin_test';
const app = express();
expressWs(app);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');
app.use(
  session({
    secret: 'voting-app-secret',
    resave: false,
    saveUninitialized: false,
  })
);
let connectedClients = [];

//Note: Not all routes you need are present here, some are missing and you'll need to add them yourself.

app.ws('/ws', (socket, request) => {
  connectedClients.push(socket);

  socket.on('message', async (message) => {
    try {
      const { pollId, selectOption } = JSON.parse(message);

      const poll = await Poll.findById(pollId);
      const option = poll.options.find((o) => o.answer === selectOption);

      if (option) {
        option.votes += 1;
        await poll.save();

        connectedClients.forEach((client) => {
          client.send(JSON.stringify({ type: 'UPDATE_VOTE', poll }));
        });
      }
    } catch (error) {
      console.error('Error processing vote: ', error);
    }
  });

  socket.on('close', () => {
    connectedClients = connectedClients.filter((client) => client !== socket);
  });
});

app.get('/', async (request, response) => {
  if (request.session.user?.id) {
    return response.redirect('/dashboard');
  }

  response.render('index/unauthenticatedIndex', {});
});

app.get('/login', async (request, response) => {});

app.post('/login', async (request, response) => {
  const { email, password } = request.body;

  const user = await User.findOne({ email });

  if (!user) {
    return response.render('unauthenticatedIndex', {
      errorMessage: 'Invalid credentials.',
    });
  }

  const isMatch = await bcrypt.compare(password, user.password);
  if (!isMatch) {
    return response.render('unauthenticatedIndex', {
      errorMessage: 'Invalid credentials.',
    });
  }

  request.session.user = { id: user._id, name: user.name };
  response.redirect('/dashboard');
});

app.get('/signup', async (request, response) => {
  if (request.session.user?.id) {
    return response.redirect('/dashboard');
  }

  return response.render('signup', { errorMessage: null });
});

app.get('/dashboard', async (request, response) => {
  if (!request.session.user?.id) {
    return response.redirect('/');
  }

  //TODO: Fix the polls, this should contain all polls that are active. I'd recommend taking a look at the
  //authenticatedIndex template to see how it expects polls to be represented
  const polls = await Poll.find({});
  return response.render('index/authenticatedIndex', { polls });
});

app.get('/profile', async (request, response) => {
  if (!request.session.user?.id) {
    return response.redirect('/');
  }

  const user = await User.findById(request.session.user.id);
  const pollsCreated = await Poll.countDocuments({ createdBy: user._id });
  const pollsVotedIn = 0;

  response.render('profile', {
    user,
    pollsCreated,
    pollsVotedIn,
  });
});

app.get('/createPoll', async (request, response) => {
  if (!request.session.user?.id) {
    return response.redirect('/');
  }

  return response.render('createPoll');
});

// Poll creation
app.post('/createPoll', async (request, response) => {
  const { question, options } = request.body;
  const formattedOptions = options.map((option) => ({
    answer: option,
    votes: 0,
  }));

  try {
    const poll = new Poll({
      question,
      options: formattedOptions,
      createdBy: request.session.user.id,
    });

    await poll.save();

    connectedClients.forEach((socket) => {
      socket.send(JSON.stringify({ type: 'NEW_POLL', poll }));
    });

    response.redirect('/dashboard');
  } catch (error) {
    console.log('Error creating poll: ', error);
    response.status(500).send('Error creating poll. PLease try again...');
  }

  //TODO: If an error occurs, what should we do?
});

mongoose
  .connect(MONGO_URI)
  .then(() =>
    app.listen(PORT, () =>
      console.log(`Server running on http://localhost:${PORT}`)
    )
  )
  .catch((err) => console.error('MongoDB connection error:', err));

/**
 * Handles creating a new poll, based on the data provided to the server
 *
 * @param {string} question The question the poll is asking
 * @param {[answer: string, votes: number]} pollOptions The various answers the poll allows and how many votes each answer should start with
 * @returns {string?} An error message if an error occurs, or null if no error occurs.
 */
async function onCreateNewPoll(question, pollOptions) {
  try {
    //TODO: Save the new poll to MongoDB
  } catch (error) {
    console.error(error);
    return 'Error creating the poll, please try again';
  }

  //TODO: Tell all connected sockets that a new poll was added

  return null;
}

/**
 * Handles processing a new vote on a poll
 *
 * This function isn't necessary and should be removed if it's not used, but it's left as a hint to try and help give
 * an idea of how you might want to handle incoming votes
 *
 * @param {string} pollId The ID of the poll that was voted on
 * @param {string} selectedOption Which option the user voted for
 */
async function onNewVote(pollId, selectedOption) {
  try {
  } catch (error) {
    console.error('Error updating poll:', error);
  }
}
