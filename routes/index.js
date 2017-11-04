/*jshint node: true */
const express = require("express");
const router = express.Router();
const SpotifyWebApi = require("spotify-web-api-node");

//get credientials and create api object
const credentials = require("../credentials.json");
const spotify = new SpotifyWebApi(credentials);

//what permissions we need
const scopes = [
  "playlist-read-private",
  "playlist-read-collaborative",
  "playlist-modify-public",
  "playlist-modify-private"
];

//current user name
let userName;

//gotten editable playlists
let playlists;

//makes error handler
function handleError(res) {
  //return function to handle errors
  return (err) => {
    //send back to startpage
    res.redirect("/");

    //log error
    console.log("Something went wrong!", err);
  };
}

//how many playlists we get at once (50 is api maximum)
const playlistRequestAmount = 50;

//gets absolutely all playlists for a specific user
function getAllPlaylists(user, errorHandler, callback, offset, prevPlaylists) {
  //offset is 0 if not given
  if (typeof offset !== "number") {
    offset = 0;
  }

  //init as empty array if not given
  if (typeof prevPlaylists === "undefined") {
    prevPlaylists = [];
  }

  //get playlists for user
  spotify.getUserPlaylists(user,  {
    limit: playlistRequestAmount, //get as many as we can
    offset: offset
  })
    .then((data) => {
      //add playlist items to pass-down list
      prevPlaylists = prevPlaylists.concat(data.body.items.filter(
        //filter out playlists that we can't edit
        (item) => item.collaborative || item.owner.id === user));

      //if there are more playlists remaining than we have right now, get some more
      if (data.body.total > offset + playlistRequestAmount) {
        getAllPlaylists(
          user, errorHandler, callback, offset + playlistRequestAmount, prevPlaylists);
      } else {
        //call callback with last api call (reached end of call stack)
        callback(prevPlaylists);
      }
    }, errorHandler);
}

//GET main page
router.get("/", (req, res) => {
  //if code in get url
  if (req.query && req.query.code) {
    //retrieve an access token and a refresh token
    spotify.authorizationCodeGrant(req.query.code)
      .then((data) => {
        //console.log("The token expires in " + data.body.expires_in);
        //console.log("The access token is " + data.body.access_token);
        //console.log("The refresh token is " + data.body.refresh_token);

        //set the access token on the API object to use it in later calls
        spotify.setAccessToken(data.body.access_token);
        spotify.setRefreshToken(data.body.refresh_token);

        //get name from api
        spotify.getMe()
          .then((data) => {
            //get user id (used for identification of user)
            userName = data.body.id;

            //now go back to homepage
            res.redirect("/playlists");
          }, handleError(res));
      }, handleError(res));
  } else if (spotify.getAccessToken()) {
    //display normal homepage
    res.render("index", {
      title: "Startpage"
    });
  } else {
    //display view for auth request
    res.render("index", {
      title: "Authorization required",
      authURL: spotify.createAuthorizeURL(scopes, "foobar")
    });
  }
});

//GET playlists - lists playlists that the user has write access to
router.get("/playlists", (req, res) => {
  //check if we have have a code
  if (spotify.getAccessToken()) {
    //get all playlists that this user can edit
    getAllPlaylists(userName, handleError(res), (list) => {
      //save playlists
      playlists = list;

      //display playlists
      res.render("playlists", {
        title: "Playlists",
        playlists: list
      });
    });
  } else {
    //go back to main page
    res.redirect("/");
  }
});

//GET single playlist display: calculate duplicate tracks
router.get("/playlist/:playlistId", (req, res) => {

});

module.exports = router;
