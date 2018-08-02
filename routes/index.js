/*jshint node: true */
const express = require("express");
const router = express.Router();
const SpotifyWebApi = require("spotify-web-api-node");
//const inspect = require("util").inspect;

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
  return err => {
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
    .then(data => {
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
      .then(data => {
        //console.log("The token expires in " + data.body.expires_in);
        //console.log("The access token is " + data.body.access_token);
        //console.log("The refresh token is " + data.body.refresh_token);

        //set the access token on the API object to use it in later calls
        spotify.setAccessToken(data.body.access_token);
        spotify.setRefreshToken(data.body.refresh_token);

        //get name from api
        spotify.getMe()
          .then(data => {
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
    item => item.collaborative || item.owner.id === userName,
    list => {
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
  //get the playlist object we are dealing with
  const currentPlaylist = playlists.find(list => list.id === req.params.playlistId);

  //get all tracks of this playlist
  getAllItems(spotify.getPlaylistTracks.bind(
    spotify,
    currentPlaylist.owner.id,
    currentPlaylist.id
  ),
    handleError(res), 100, () => true,
    list => {
      //make a dict of tracks and thereby find tracks that we try to add multiple times
      const tracks = {};
      let toRemove = {}; //tracks to be removed from the list
      list.forEach((item, index) => {
        //don't deal with local tracks
        if (item.is_local) {
          return;
        }

        //attach playlist_index to make removal by position possible
        item.playlist_index = index;

        //generate identifier from name and all artists
        const id = item.track.name + item.track.artists.map(a => a.id).join("");

        //check if entry with this id already present
        if (tracks.hasOwnProperty(id)) {
          //create duplication group in toRemove if not present
          if (toRemove.hasOwnProperty(id)) {
            //add item to group
            toRemove[id].push(item);
          } else {
            //create with not to remove track and new duplicate track
            toRemove[id] = [tracks[id], item];
          }
        } else {
          //add normally to dict of known tracks
          tracks[id] = item;
        }
      });

      //convert to array
      toRemove = Object.keys(toRemove).map(key => toRemove[key]);

      //display playlists
      res.render("playlistTracks", {
        tracks: toRemove,
        title: "Songs to Remove",
        playlist: currentPlaylist
      });
  });
});

//POST whgich tracks should be removed
router.post("/remove/:playlistId", (req, res, next) => {
  //get the playlist object we are dealing with
  const currentPlaylist = playlists.find(list => list.id === req.params.playlistId);

  //stop if data is missing
  if (! req.body.snapshot_id) {
    next();
    return;
  }

  //get snapshot id from hidden field
  const snapshotId = req.body.snapshot_id;
  delete req.body.snapshot_id;

  //make list of track indexes to remove from post body
  let removeTrackIndexes = Object
    .keys(req.body) //get props of request body
    .map(key => ({ key: key, value: req.body[key] })) //transform into key/value pair array
    .filter(pair => pair.value) //remove false/unchecked ones
    .map(pair => parseInt(pair.key.split("_")[0], 10)); //only use index part

  //start removing at index 0
  let startIndex = 0;

  //chunk size
  const apiCallChunkSize = 2;
  console.log(removeTrackIndexes);
  //remove until done removing all
  while(startIndex) {
    //make api call to remove sons from specified positions
    //pass owner id and playlist id, indexes to remove and snapshot id of playlist before deleting
    spotify.removeTracksFromPlaylistByPosition(
      currentPlaylist.owner.id,
      currentPlaylist.id,
      removeTrackIndexes.slice(startIndex, startIndex + apiCallChunkSize),
      snapshotId
    ).catch(handleError(res));
    console.log("call", removeTrackIndexes.slice(startIndex, startIndex + apiCallChunkSize));
    //increment position
    startIndex += apiCallChunkSize;
  }

  //redirect back to playlist view
  res.redirect("/playlist/" + currentPlaylist.id);
});

module.exports = router;
