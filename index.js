const express = require('express');
const cors = require('cors');
const port = process.env.PORT || 8080;
const app = express();
const jwt = require('jsonwebtoken');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
require('dotenv').config();

// Error handling middleware (for unhandled errors)
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).send('Something went wrong!');
});

// MIDDLEWARE:----------------------->>>>
app.use(cors());
app.use(express.json());

// CUSTOM ERROR HANDLER MIDDLEWARE:----------------------->>>>
const stripe = require('stripe')(process.env.PAYMENT_SECRET_KEY);

// JWT:----------------------->>>>
const verifyJWT = (req, res, next) => {
  const authorization = req.headers.authorization;
  if (!authorization) {
    return res
      .status(401)
      .send({ error: true, message: 'unauthorized access' });
  }
  // bearer token
  const token = authorization.split(' ')[1];

  jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
    if (err) {
      return res
        .status(401)
        .send({ error: true, message: 'unauthorized access' });
    }
    req.decoded = decoded;
    next();
  });
};

// DATABASE:----------------------->>>>
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cyco.ehplf2h.mongodb.net/?retryWrites=true&w=majority`;

// const uri = `mongodb://${process.env.DB_USER}:${process.env.DB_PASS}@ac-15myamh-shard-00-00.ehplf2h.mongodb.net:27017,ac-15myamh-shard-00-01.ehplf2h.mongodb.net:27017,ac-15myamh-shard-00-02.ehplf2h.mongodb.net:27017/?ssl=true&replicaSet=atlas-7hujl1-shard-0&authSource=admin&retryWrites=true&w=majority`

// const uri = `mongodb://${process.env.DB_USER}:${process.env.DB_PASS}@ac-15myamh-shard-00-00.ehplf2h.mongodb.net:27017,ac-15myamh-shard-00-01.ehplf2h.mongodb.net:27017,ac-15myamh-shard-00-02.ehplf2h.mongodb.net:27017/?ssl=true&replicaSet=atlas-7hujl1-shard-0&authSource=admin&retryWrites=true&w=majority`

// CREATE MONGO-CLIENT:----------------------->>>>
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

// SOCKET-CONNECTION:----------------------->>>>
const http = require('http');
const { Server } = require('socket.io');
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: 'http://localhost:5173',
    methods: ['GET', 'POST'],
  },
});

io.on('connection', (socket) => {
  console.log(`User Connected: ${socket.id}`);

  // Handle disconnection
  socket.on('disconnect', () => {
    console.log(`User Disconnected: ${socket.id}`);
  });

  socket.on('send_notification', (data) => {
    console.log(data);
    // Emit the received notification to all connected clients except the sender
    socket.broadcast.emit('receive_notification', data);
  });
});

// Warning: use verifyJWT before using verifyAdmin
const verifyAdmin = async (req, res, next) => {
  const email = req.decoded.email;
  const query = { email: email };
  const user = await usersCollection.findOne(query);
  if (user?.role !== 'admin') {
    return res.status(403).send({ error: true, message: 'forbidden message' });
  }
  next();
};

async function run() {
  try {
    await client.connect();
    const moviesCollection = client.db('cyco').collection('movies');
    const usersCollection = client.db('cyco').collection('users');
    const seriesCollection = client.db('cyco').collection('series');
    const queryCollection = client.db('cyco').collection('forumQueries');
    const paymentsCollection = client.db('cyco').collection('payments');

    app.post('/jwt', (req, res) => {
      const user = req.body;
      const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, {
        expiresIn: '24h',
      });
      res.send({ token });
    });

    // MOVIES:----------------------->>>>
    app.get('/movies', async (req, res) => {
      try {
        const result = await moviesCollection.find().toArray();
        res.status(200).json(result);
      } catch (error) {
        res.status(500).json({ error: 'Internal server error' });
      }
    });

    app.post('/movies', async (req, res) => {
      try {
        const movieData = req.body;
        const result = await moviesCollection.insertOne(movieData);
        // res.send(result)
    
        if (result.insertedCount === 1) {
          res.status(201).json({ message: 'Movie saved successfully' });
        } else {
          res.status(500).json({ error: 'Failed to save the movie' });
        }
      } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Internal server error' });
      }
    });

    // SERIES:----------------------->>>>
    app.get('/series', verifyJWT, async (req, res) => {
      try {
        const result = await seriesCollection.find().toArray();
        res.status(200).json(result);
      } catch (error) {
        res.status(500).json({ error: 'Internal Server Error' });
      }
    });

    // USERS:----------------------->>>>
    app.get('/users', async (req, res) => {
      try {
        const result = await usersCollection.find().toArray();
        res.status(200).json(result);
      } catch (error) {
        res.status(500).json({ error: 'Internal server error' });
      }
    });

    app.get('/user/:email', async (req, res) => {
      try {
        const { email } = req.params;
        const userData = await usersCollection.findOne({ email });
        if (userData) {
          res.status(200).json(userData);
        } else {
          res.status(404).json({ error: 'User not found' });
        }
      } catch (error) {
        res.status(500).json({ error: 'Internal server error' });
      }
    });

    app.post('/register', async (req, res) => {
      try {
        const { username, email, password, role, photoUrl } = req.body;

        // Check if the email is already registered
        const existingUser = await usersCollection.findOne({ email });
        if (existingUser) {
          return res.status(409).json({ error: 'Email already registered' });
        }

        // Create a new user document
        await usersCollection.insertOne({
          username,
          role,
          email,
          password,
          photoUrl,
          wishlist: [],
        });

        res.status(201).json({ message: 'User registered successfully' });
      } catch (error) {
        res.status(500).json({ error: 'Internal server error' });
      }
    });

    app.put('/history/:id', async (req, res) => {
      try {
        const { id } = req.params;
        const updatedUserData = req.body;

        const updatedUser = await User.findByIdAndUpdate(id, updatedUserData, {
          new: true, // Return the updated document
        });

        if (!updatedUser) {
          return res.status(404).json({ message: 'User not found' });
        }

        res.json(updatedUser);
      } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server error' });
      }
    });

    // Check admin
    app.get('/users/admin/:email', verifyJWT, async (req, res) => {
      const email = req.params.email;

      if (req.decoded.email !== email) {
        res.send({ admin: false });
      }

      const query = { email: email };
      const user = await usersCollection.findOne(query);
      const result = { admin: user?.role === 'admin' };
      res.send(result);
    });

    app.patch('/users/admin/:id', async (req, res) => {
      const id = req.params.id;
      console.log(id);
      const filter = { _id: new ObjectId(id) };
      const updateDoc = {
        $set: {
          role: 'admin',
        },
      };

      const result = await usersCollection.updateOne(filter, updateDoc);
      res.send(result);
    });

    // WISHLIST----------------------->>>>
    app.post('/wishlist', async (req, res) => {
      try {
        const { user, movie } = req.body;
        console.log(user?.email);

        if (!user || !user?.email) {
          return res.status(400).json({ error: 'Invalid user data' });
        }

        const userExists = await usersCollection.findOne({
          email: user?.email,
        });

        if (!userExists) {
          return res.status(404).json({ error: 'User not found' });
        }

        const alreadyInWishlist = userExists.wishlist.some(
          (wishlist) => wishlist?._id === movie?._id
        );

        if (alreadyInWishlist) {
          return res.status(403).json({ message: 'Already added to wishlist' });
        }

        await usersCollection.updateOne(
          { email: user?.email },
          { $addToSet: { wishlist: movie } }
        );

        res.status(200).json({ message: 'Movie added to wishlist!' });

        const wishlist = await usersCollection.updateOne(
          { email: user?.email },
          { $addToSet: { wishlist: movie } }
        );

        // if (wishlist.modifiedCount === 1) {
        //   res.status(200).json({ message: 'Movie added to wishlist' });
        // } else if (wishlist.matchedCount === 1) {
        //   res.status(403).json({ message: 'Already added to wishlist' });
        // } else {
        //   res.status(404).json({ error: 'User not found' });
        // }
      } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Internal server error' });
      }
    });

    // PAYMENT:----------------------->>>>
    app.post('/create-payment-intent', async (req, res) => {
      const { price } = req.body;
      const amount = price * 100;

      const paymentIntent = await stripe.paymentIntents.create({
        amount: amount,
        currency: 'usd',
        automatic_payment_methods: {
          enabled: true,
        },
      });

      res.send({
        clientSecret: paymentIntent.client_secret,
      });
    });

    app.post('/payments', async (req, res) => {
      const payment = req.body;
      const result = await paymentsCollection.insertOne(payment);
      res.send(result);
    });

    // FORUM QUERIES:----------------------->>>>
    app.post('/query', async (req, res) => {
      try {
        const { user, query } = req.body;
        // console.log(user, query);

        const querySlot = await usersCollection.updateOne(
          { email: user?.email },
          { $addToSet: { querySlot: query } }
        );
        // console.log(querySlot);
      } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Internal server error' });
      }
    });

    // FORUM:----------------------->>>>
    app.post('/forumQueries', async (req, res) => {
      try {
        const newQuery = req.body;
        // console.log(req.body);

        const forumQueries = await queryCollection.insertOne(newQuery);
        res.send(forumQueries);
        // console.log(forumQueries);
      } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Internal server error' });
      }
    });

    app.get('/forumQueries', async (req, res) => {
      try {
        const fetchedQueries = await queryCollection.find().toArray();
        // console.log(fetchedQueries);
        res.status(200).json(fetchedQueries);
      } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Internal server error' });
      }
    });

    // Update query views by ID
    app.post('/forumQueries/:id', async (req, res) => {
      try {
        const queryId = req.params.id;
        const updatedViews = req.body.views;

        // Update the query views in your database
        const updatedQuery = await queryCollection.updateOne(
          { _id: new ObjectId(queryId) },
          { $set: { views: updatedViews } }
        );

        if (updatedQuery.modifiedCount === 1) {
          res.json({ success: true });
        } else {
          res.json({ success: false });
        }
      } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Internal server error' });
      }
    });

    // CHECK SERVER CONNECTION:----------------------->>>>
    await client.db('admin').command({ ping: 1 });
    console.log('Hey Dev! No pain No gain.. Successfully Connected MongoDb');
  } finally {
    // await client.close();
  }
}

run().catch(console.dir);

app.get('/', (req, res) => {
  res.send('cyco-engine');
});

server.listen(port, () => {
  console.log(`SERVER IS RUNNING ON PORT ${port}`);
});
