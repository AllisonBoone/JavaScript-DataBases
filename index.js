const express = require('express');
const expressWs = require('express-ws');
const path = require('path');
const mongoose = require('mongoose');
const session = require('express-session');
const bcrypt = require('bcrypt');
const { request } = require('http');

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
  voters: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
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
      const { pollId, selectedOption } = JSON.parse(message);
      const userId = request.session?.user?.id;

      if (!userId) {
        console.error('User not authenticated.');
        return;
      }

      const poll = await Poll.findById(pollId);

      if (!poll) {
        console.error('Poll not found');
        return;
      }

      const option = poll.options.find((o) => o.answer === selectedOption);

      if (option) {
        if (!poll.voters.includes(userId)) {
          option.votes += 1;
          poll.voters.push(userId);
          await poll.save();

          connectedClients.forEach((client) => {
            client.send(JSON.stringify({ type: 'UPDATE_VOTE', poll }));
          });
        } else {
          console.log('Duplicate vote from user: ', userId);
        }
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

app.post('/signup', async (request, response) => {
  const { name, email, password } = request.body;

  try {
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return response.render('signup', {
        errorMessage: 'Email is already registered.',
      });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const user = new User({ name, email, password: hashedPassword });
    await user.save();

    request.session.user = { id: user._id, name: user.name };
    response.redirect('/dashboard');
  } catch (error) {
    console.error('Error during signup: ', error);
    response.status(500).render('signup', {
      errorMessage: 'An error occurred during signup. Please try again.',
    });
  }
});

app.get('/dashboard', async (request, response) => {
  if (!request.session.user?.id) {
    return response.redirect('/');
  }

  //TODO: Fix the polls, this should contain all polls that are active. I'd recommend taking a look at the
  //authenticatedIndex template to see how it expects polls to be represented
  const polls = await Poll.find({});
  const userName = request.session.user.name;
  return response.render('index/authenticatedIndex', { polls, userName });
});

app.get('/profile', async (request, response) => {
  if (!request.session.user?.id) {
    return response.redirect('/');
  }

  try {
    const user = await User.findById(request.session.user.id);
    const pollsCreated = await Poll.countDocuments({ createdBy: user._id });
    const pollsVotedIn = await Poll.countDocuments({ voters: user._id });

    response.render('profile', {
      user,
      pollsCreated,
      pollsVotedIn,
    });
  } catch (error) {
    console.error('Error fetching profile data: ', error);
    response.status(500).send('Error fetching profile data.');
  }
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

  if (!options || options.length === 0) {
    return response.status(400).send('Poll options can not be empty.');
  }

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
    response.render('createPoll', {
      errorMessage:
        'Error occurred while creating the poll. Please try again...',
    });
  }

  //TODO: If an error occurs, what should we do?
});

app.get('/logout', (request, response) => {
  request.session.destroy(() => {
    response.redirect('/');
  });
});

app.use((request, response) => {
  response.status(404).render('404', { errorMessage: 'Page not found' });
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

/**
 * Handles processing a new vote on a poll
 *
 * This function isn't necessary and should be removed if it's not used, but it's left as a hint to try and help give
 * an idea of how you might want to handle incoming votes
 *
 * @param {string} pollId The ID of the poll that was voted on
 * @param {string} selectedOption Which option the user voted for
 */
