// Establish a WebSocket connection to the server
const socket = new WebSocket('ws://localhost:3000/ws');

// Listen for messages from the server
socket.addEventListener('message', (event) => {
  const data = JSON.parse(event.data);

  //TODO: Handle the events from the socket
  switch (data.type) {
    case 'NEW_POLL':
      onNewPollAdded(data.poll);
      break;
    case 'UPDATE_VOTE':
      onIncomingVote(data.poll);
      break;
    default:
      console.error('Unknown message type: ', data.type);
  }
});

socket.addEventListener('error', (error) => {
  console.error('WebSocket error has occurred: ', error);
});

socket.addEventListener('close', () => {
  console.warn('WebSocket connection closed, refresh the page.');
  const messageContainer = document.getElementById('messages');

  if (messageContainer) {
    messageContainer.innerHTML =
      '<p class="error">Connection lost... Please refresh the page.</p>';
  }

  setTimeout(() => {
    location.reload();
  }, 5000);
});

/**
 * Handles adding a new poll to the page when one is received from the server
 *
 * @param {*} data The data from the server (ideally containing the new poll's ID and it's corresponding questions)
 */
function onNewPollAdded(data) {
  //TODO: Fix this to add the new poll to the page
  if (!data || !data._id || !data.question || !data.options) {
    console.error('Invalid poll data: ', data);
    return;
  }

  const pollContainer = document.getElementById('polls');

  if (!pollContainer) {
    console.error('Poll container not found.');
    return;
  }

  const newPoll = document.createElement('div');
  newPoll.className = 'poll-container';
  newPoll.dataset.pollId = data._id;

  newPoll.innerHTML = `
        <h2>${data.question}</h2>
            <ul class="poll-options">
            ${data.options
              .map(
                (option) => `
                    <li>
                    <form class="poll-form">
                        <input type="hidden" name="poll-id" value="${data._id}" />
                        <button type="submit" value="${option.answer}">
                        ${option.answer} (${option.votes})
                        </button>
                    </form>
                    </li>`
              )
              .join('')}
            </ul>
    `;

  pollContainer.appendChild(newPoll);

  //TODO: Add event listeners to each vote button. This code might not work, it depends how you structure your polls on the poll page. However, it's left as an example
  //      as to what you might want to do to get clicking the vote options to actually communicate with the server
  newPoll
    .querySelectorAll('.poll-form:not([data-listener-added])')
    .forEach((pollForm) => {
      pollForm.addEventListener('submit', onVoteClicked);
      pollForm.setAttribute('data-listener-added', true);
    });
}

/**
 * Handles updating the number of votes an option has when a new vote is recieved from the server
 *
 * @param {*} data The data from the server (probably containing which poll was updated and the new vote values for that poll)
 */
function onIncomingVote(poll) {
  const pollElement = document.querySelector(`[data-poll-id="${poll._id}"]`);

  if (!pollElement) {
    console.error('Poll not found: ', poll._id);
    return;
  }

  poll.options.forEach((option) => {
    const button = pollElement.querySelector(
      `button[value="${option.answer}"]`
    );

    if (button) {
      button.innerHTML = `${option.answer} (${option.votes})`;
    }
  });
}

/**
 * Handles processing a user's vote when they click on an option to vote
 *
 * @param {FormDataEvent} event The form event sent after the user clicks a poll option to "submit" the form
 */
function onVoteClicked(event) {
  //Note: This function only works if your structure for displaying polls on the page hasn't changed from the template. If you change the template, you'll likely need to change this too
  event.preventDefault();
  const formData = new FormData(event.target);

  const pollId = formData.get('poll-id');
  const selectedOption = event.submitter.value;

  event.submitter.disabled = true;

  if (socket.readyState === WebSocket.OPEN) {
    socket.send(
      JSON.stringify({
        pollId: pollId,
        selectedOption: selectedOption,
      })
    );

    const existingFeedback = event.target.querySelector('.vote-feedback');
    if (existingFeedback) {
      existingFeedback.remove();
    }

    const feedback = document.createElement('p');
    feedback.className = 'vote-feedback';
    feedback.innerText = 'Vote submitted successfully!';
    event.target.appendChild(feedback);

    setTimeout(() => feedback.remove(), 3000);
  } else {
    console.error('WebSocket not open, unable to send vote.');
    alert('Connection error, try again later.');
    event.submitter.disabled = false;
  }

  //TOOD: Tell the server the user voted
}

//Adds a listener to each existing poll to handle things when the user attempts to vote
document.querySelectorAll('.poll-form').forEach((pollForm) => {
  pollForm.addEventListener('submit', onVoteClicked);
});
