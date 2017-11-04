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

//gets absolutely all playlists for a specific user
function getAllItems(
  getCall,
   errorHandler,
   requestAmount,
   itemFilter,
   callback,
   offset,
   prevItems
) {
  //offset is 0 if not given
  if (typeof offset !== "number") {
    offset = 0;
  }

  //init as empty array if not given
  if (typeof prevItems === "undefined") {
    prevItems = [];
  }

  //get playlists for user
  getCall({
    limit: requestAmount, //get as many as we can
    offset: offset
  })
    .then((data) => {
      //add playlist items to pass-down list
      prevItems = prevItems.concat(data.body.items.filter(itemFilter));

      //if there are more items remaining than we have right now, get some more
      if (data.body.total > offset + requestAmount) {
        getAllItems(
          getCall,
          errorHandler,
          requestAmount,
          itemFilter,
          callback,
          offset + requestAmount,
          prevItems
        );
      } else {
        //call callback with last api call (reached end of call stack)
        callback(prevItems);
      }
    }, errorHandler);
}

//GET any page
router.get("*", (req, res, next) => {
  //must have code or be sending code
  if (spotify.getAccessToken() || req.query && req.query.code) {
    //is authed, may proceed
    next();
  } else {
    //display view for auth request if necessary
    res.render("index", {
      title: "Authorization required",
      authURL: spotify.createAuthorizeURL(scopes, "foobar")
    });
  }
});

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
  } else {
    //display normal homepage
    res.render("index", {
      title: "Startpage"
    });
  }
});

//GET playlists - lists playlists that the user has write access to
router.get("/playlists", (req, res) => {
  //get all playlists that this user can edit
  getAllItems(spotify.getUserPlaylists.bind(spotify, userName),
    handleError(res), 50,
    (item) => item.collaborative || item.owner.id === userName,
    (list) => {
      //save playlists
      playlists = list;

      //display playlists
      res.render("playlists", {
        playlists: list,
        title: "Pick Playlist"
      });
  });
});

//GET single playlist display: calculate duplicate tracks
router.get("/playlist/:playlistId", (req, res) => {
  //get all tracks of this playlist
  getAllItems(spotify.getPlaylistTracks.bind(spotify, userName, req.params.playlistId),
    handleError(res), 100, () => true,
    (list) => {
      console.log(list);

      //display playlists
      res.render("playlist", {
        tracks: list,
        title: "Songs to Remove"
      });
  });
});

module.exports = router;
