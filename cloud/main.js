var minMiles = 0.001; // set this to a minimum value to avoid worst senario
// we'll adjust this minMiles when we have better solution
// 5km so far is a bit too arbitrary

// If user's ACL hasn't been set yet, set ACL
Parse.Cloud.afterSave(Parse.User, function(request) {
	if(!request.object.get("ACL")) {
		var newACL = new Parse.ACL();
		newACL.setPublicReadAccess(true);
		newACL.setWriteAccess(request.object.id,true);
		request.object.setACL(newACL);
		request.object.save();
	}
});

Parse.Cloud.beforeSave("TravelPlan",function(request,response){
	var obj = request.object;
	var gl = obj.get("geoLocation");
	obj.unset("geoLocation", { silent: true });

	var newACL = new Parse.ACL();
	newACL.setPublicReadAccess(true);
	newACL.setWriteAccess(request.user,true);
	newACL.setPublicWriteAccess(false);
	obj.setACL(newACL);

	var query = new Parse.Query("MapMarker");
	query.withinMiles("geoLocation", gl, minMiles);
	query.limit(1);
	query.find({
		success:function(results){
			if(results.length){
				var mapMarker = results[0];
				obj.set("markerParent",mapMarker);
				obj.set("location",mapMarker.get('location')); // set plan location to mapMarker location
				response.success();
			}else{
				var MM = Parse.Object.extend("MapMarker");
				var mapMarker = new MM();
				mapMarker.set("geoLocation",gl);
				mapMarker.set("location",obj.get("location"));
				mapMarker.save(null, {
					success:function(savedMarker){
						obj.set("markerParent",savedMarker);
						response.success();
					},
					error:function(msg){
						response.error(msg);
					}
				});
			}
		},
		error:function(msg){
			response.error(msg);
		}
	});
});

Parse.Cloud.beforeSave("MapMarker",function(request,response){
	var newACL = new Parse.ACL();
	newACL.setPublicReadAccess(true);
	newACL.setPublicWriteAccess(false);
	request.object.setACL(newACL);
	response.success();
});

Parse.Cloud.beforeSave("PlanLike",function(request,response){
	var newACL = new Parse.ACL();
	newACL.setPublicReadAccess(true);
	newACL.setPublicWriteAccess(false);
	newACL.setWriteAccess(request.user,true);
	var q = new Parse.Query("PlanLike");
	q.equalTo("user",request.user);
	q.equalTo("plan",request.object.get("plan"));
	q.find({
		success:function(res){
			if(!res.length){
				request.object.setACL(newACL);
				request.object.set("user",request.user);
				response.success();
			}else{
				response.error("Plan already liked by user");
			}
		}
	});
});

//Parse.Cloud.run("fixCallen");
/*
Parse.Cloud.define("fixCallen", function(request, response) {
	Parse.Cloud.useMasterKey();
	var query = new Parse.Query("_User");
	query.equalTo("objectId", "RvIjR9OJAm");
	query.find({
		success: function(results) {
			var p = results[0];
			p.set("facebookID", "100003206404931");
			//p.set("email", response.email);
			p.set("firstName", "Stephen");
			p.set("lastName", "O'Hanlon");
			p.set("imgURL", "https://fbcdn-profile-a.akamaihd.net/hprofile-ak-prn1/t1.0-1/s320x320/944599_443390389111171_1459714224_n.jpg");
			p.save(null, {
				success: function(user) {
					response.success();
				}
			});
		}
	});
});
*/

/*
Parse.Cloud.define("fixCallen", function(request, response) {
	Parse.Cloud.useMasterKey();
	var query = new Parse.Query("SummerPlan");
	query.equalTo("objectId", "DMpUw5jifm");
	query.find({
		success: function(results) {
			var p = results[0];
			p.set("facebookID", "597524992");
			//p.set("email", response.email);
			p.set("name", "Callen Rain");
			p.set("imgURL", "https://fbcdn-profile-a.akamaihd.net/hprofile-ak-ash3/t1.0-1/s320x320/1003868_10152196431999993_1232101139_n.jpg");
			p.save(null, {
				success: function(p) {
					response.success();
				}
			});
		}
	});
});


*/
