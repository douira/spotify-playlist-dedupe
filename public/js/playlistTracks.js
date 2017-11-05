/*jshint browser: true, jquery: true */

//when loaded
$(document).ready(() => {
  //register click listener on button
  $("#remove-trigger").on("click", (e) => {
    //stop link follow
    e.preventDefault();

    //submit form
    $("form#remove-form").submit();
  });
});
